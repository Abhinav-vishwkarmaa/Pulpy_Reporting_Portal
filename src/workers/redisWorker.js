import redis from '../config/redis.js';
import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import trackingService from '../services/trackingService.js';
import postbackService from '../services/postbackService.js';

const BATCH_SIZE = 100; // Batch Insert Size
const BATCH_TIMEOUT = 1000; // Wait max 1s to fill batch
const STREAM_KEY = 'stream:clicks';
const GROUP_NAME = 'workers_group';
const CONSUMER_NAME = `worker_${process.env.HOSTNAME || 'local'}_${process.pid}`;
const MAX_RETRY_ATTEMPTS = 3; // Maximum retry attempts for failed inserts

async function setupStream() {
    try {
        await redis.xgroup('CREATE', STREAM_KEY, GROUP_NAME, '$', 'MKSTREAM');
    } catch (err) {
        if (!err.message.includes('BUSYGROUP')) throw err;
    }
}

async function runWorker() {
    await setupStream();
    logger.info(`👷 Redis Stream Worker Started: ${CONSUMER_NAME}`);

    while (true) {
        try {
            // Read from Stream
            const response = await redis.xreadgroup(
                'GROUP', GROUP_NAME, CONSUMER_NAME,
                'COUNT', BATCH_SIZE,
                'BLOCK', BATCH_TIMEOUT,
                'STREAMS', STREAM_KEY, '>'
            );

            if (!response || !response.length) {
                // No new messages
                continue;
            }

            const streamEntries = response[0][1];
            if (streamEntries.length === 0) continue;

            logger.info(`📦 Worker Processing Batch: ${streamEntries.length} clicks`);

            const clickIds = [];
            const msgIds = [];

            // Extract Click IDs
            for (const [msgId, fields] of streamEntries) {
                // Fields are [key1, val1, key2, val2...]
                // We stored 'id' as key
                const idIndex = fields.indexOf('id');
                if (idIndex !== -1) {
                    clickIds.push(fields[idIndex + 1]);
                    msgIds.push(msgId);
                }
            }

            if (clickIds.length === 0) {
                // Ack empty messages
                if (msgIds.length > 0) await redis.xack(STREAM_KEY, GROUP_NAME, ...msgIds);
                continue;
            }

            // Fetch Full Data from Redis Pipelined
            const pipeline = redis.pipeline();
            clickIds.forEach(id => pipeline.hgetall(`click:${id}`));
            const dataResults = await pipeline.exec();

            const clicksToInsert = [];
            const validMsgIds = [];

            for (let i = 0; i < dataResults.length; i++) {
                const [err, clickData] = dataResults[i];
                if (!err && clickData && clickData.offer_id) {
                    clicksToInsert.push(clickData);
                    validMsgIds.push(msgIds[i]);
                } else {
                    logger.warn(`Click data missing in Redis for ID: ${clickIds[i]}`);
                    // Ensure we ack it so we don't loop forever
                    validMsgIds.push(msgIds[i]);
                }
            }

            if (clicksToInsert.length > 0) {
                // 1. Bulk Insert Clicks to MySQL with retry logic
                let retryCount = 0;
                let insertSuccess = false;

                while (retryCount < MAX_RETRY_ATTEMPTS && !insertSuccess) {
                    try {
                        await bulkInsertClicks(clicksToInsert);
                        insertSuccess = true;

                        // 2. SUCCESS! Now check for Pending Conversions in Redis
                        // For each successfully inserted click, check if a conversion is waiting
                        await processPendingConversions(clicksToInsert);

                        // 3. Stats - Aggregation
                        // We increment Redis counters for stats, not DB directly here.
                        // Separate Stats Worker will flush these.
                        const pipelineStats = redis.pipeline();
                        const today = new Date().toISOString().split('T')[0];
                        for (const c of clicksToInsert) {
                            // Increment Click Count
                            pipelineStats.incr(`stats:offer:${c.offer_id}:${today}:clicks`);
                            pipelineStats.incr(`stats:pub:${c.publisher_id}:${today}:clicks`);
                        }
                        await pipelineStats.exec();

                        // 4. Cleanup & ACK
                        const cleanupPipeline = redis.pipeline();
                        // ACK ONLY after success
                        cleanupPipeline.xack(STREAM_KEY, GROUP_NAME, ...validMsgIds);
                        // Remove click keys (TTL will clean them up eventually, but removing frees RAM)
                        clickIds.forEach(id => cleanupPipeline.del(`click:${id}`));
                        await cleanupPipeline.exec();

                        logger.info(`✅ Processed Batch: ${clicksToInsert.length} clicks`);

                    } catch (dbErr) {
                        retryCount++;
                        const isLastAttempt = retryCount >= MAX_RETRY_ATTEMPTS;

                        logger.error(`❌ BATCH DB INSERT FAILED - ATTEMPT ${retryCount}/${MAX_RETRY_ATTEMPTS}`, {
                            error: dbErr.message,
                            sqlMessage: dbErr.sqlMessage,
                            code: dbErr.code,
                            batchSize: clicksToInsert.length,
                            clickIds: clickIds.slice(0, 5),
                            willRetry: !isLastAttempt,
                            nextAction: isLastAttempt ? 'MOVE_TO_DLQ' : 'RETRY_WITH_BACKOFF'
                        });

                        if (isLastAttempt) {
                            // Move to dead letter queue for manual inspection
                            await moveToDeadLetterQueue(clicksToInsert, dbErr);
                            // ACK to prevent infinite retries, but log that data was moved to DLQ
                            await redis.xack(STREAM_KEY, GROUP_NAME, ...validMsgIds);
                            logger.error('❌ MAX RETRIES EXCEEDED - MOVED TO DLQ AND ACKED');
                        } else {
                            // Exponential backoff: 2^retryCount seconds
                            const backoffMs = Math.pow(2, retryCount) * 1000;
                            logger.info(`⏳ RETRYING IN ${backoffMs}ms...`);
                            await new Promise(r => setTimeout(r, backoffMs));
                        }
                    }
                }
            } else {
                // Empty batch (e.g. malformed data in redis), logic to skip/ack? 
                // If we had validMsgIds but no clicksToInsert, we should ACK them to avoid loops
                if (validMsgIds.length > 0) {
                    await redis.xack(STREAM_KEY, GROUP_NAME, ...validMsgIds);
                }
            }

        } catch (err) {
            logger.error('Worker Error:', err);
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

async function bulkInsertClicks(clicks) {
    if (clicks.length === 0) return;

    // Validate data integrity before insert
    const invalidClicks = [];
    const validClicks = [];

    for (const click of clicks) {
        const errors = [];

        // Required fields validation
        if (!click.click_uuid || typeof click.click_uuid !== 'string' || click.click_uuid.length !== 36) {
            errors.push(`invalid click_uuid: ${click.click_uuid}`);
        }
        if (!click.offer_id || isNaN(parseInt(click.offer_id))) {
            errors.push(`invalid offer_id: ${click.offer_id}`);
        }
        if (!click.publisher_id || isNaN(parseInt(click.publisher_id))) {
            errors.push(`invalid publisher_id: ${click.publisher_id}`);
        }
        if (!click.timestamp) {
            errors.push(`missing timestamp`);
        }

        // Try to parse timestamp
        let timestamp;
        try {
            timestamp = new Date(click.timestamp);
            if (isNaN(timestamp.getTime())) {
                errors.push(`invalid timestamp format: ${click.timestamp}`);
            }
        } catch (e) {
            errors.push(`timestamp parse error: ${e.message}`);
        }

        if (errors.length > 0) {
            invalidClicks.push({ click: click.click_uuid || 'unknown', errors });
        } else {
            validClicks.push(click);
        }
    }

    if (invalidClicks.length > 0) {
        logger.error('❌ DATA VALIDATION FAILED - INVALID CLICKS FOUND:', {
            invalidCount: invalidClicks.length,
            totalClicks: clicks.length,
            sampleErrors: invalidClicks.slice(0, 3)
        });
        // Continue with valid clicks only, but log the invalid ones
    }

    if (validClicks.length === 0) {
        logger.error('❌ NO VALID CLICKS TO INSERT');
        throw new Error('No valid clicks to insert after validation');
    }

    // Use regular INSERT (not INSERT IGNORE) to ensure constraint violations are caught
    const sql = `INSERT INTO clicks (
        click_uuid, offer_id, publisher_id, publisher_offer_id,
        ip, user_agent, referrer, country, region, city, isp, location, domain,
        device_type, browser, os, os_version, device_brand, device_model,
        source_id, device_id, google_id, android_id, rcid, tid,
        timestamp, created_at
    ) VALUES ?`;

    const values = validClicks.map(c => [
        c.click_uuid, parseInt(c.offer_id), parseInt(c.publisher_id), c.publisher_offer_id ? parseInt(c.publisher_offer_id) : null,
        c.ip, c.user_agent, c.referrer, c.country, c.region || null, c.city || null, c.isp || null, c.location || null, c.domain,
        c.device_type, c.browser, c.os, c.os_version, c.device_brand, c.device_model,
        c.source_id || null, c.device_id || null, c.google_id || null, c.android_id || null,
        c.rcid || null, c.tid || null,
        new Date(c.timestamp), new Date() // timestamp, created_at
    ]);

    try {
        await pool.query(sql, [values]);
    } catch (err) {
        logger.error('❌ BULK INSERT FAILED - DETAILED ERROR INFO:', {
            message: err.message,
            sqlMessage: err.sqlMessage,
            code: err.code,
            errno: err.errno,
            sqlState: err.sqlState,
            sql: sql,
            valuesCount: values.length,
            firstValueSample: values.length > 0 ? values[0] : null
        });
        throw err;
    }
}

async function processPendingConversions(clicks) {
    // Check Redis for conversion:{click_id}
    const pipeline = redis.pipeline();
    clicks.forEach(c => pipeline.get(`conversion:${c.click_uuid}`));
    const results = await pipeline.exec();

    for (let i = 0; i < results.length; i++) {
        const [err, conversionJson] = results[i];
        if (!err && conversionJson) {
            try {
                const conv = JSON.parse(conversionJson);
                // Insert Conversion
                await pool.query(
                    `INSERT INTO conversions (
                      conversion_uuid, click_uuid, offer_id, publisher_id, publisher_offer_id,
                      rcid, status, amount, payout, ip, postback_payload, timestamp, created_at, updated_at
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP())`,
                    [
                        uuidv4(), // Generate new DB internal ID or use one if we generated?
                        conv.click_uuid, conv.offer_id, conv.publisher_id, conv.publisher_offer_id,
                        conv.rcid, conv.status, conv.amount, conv.payout, conv.ip,
                        conv.postback_payload, new Date(conv.timestamp)
                    ]
                );

                // Update Stats (Redis Atomic Counters)
                // stats:offer:{id}:{date}:conversions
                // stats:offer:{id}:{date}:revenue
                // stats:offer:{id}:{date}:payout

                const today = new Date().toISOString().split('T')[0];
                const pipe = redis.pipeline();

                const statsKeyOffer = `stats:offer:${conv.offer_id}:${today}`;
                const statsKeyPub = `stats:pub:${conv.publisher_id}:${today}`; // If we track pub stats

                pipe.incr(`${statsKeyOffer}:conversions`);
                pipe.incrbyfloat(`${statsKeyOffer}:revenue`, conv.amount); // Redis doesn't support float well in old versions, but incrbyfloat is standard now
                pipe.incrbyfloat(`${statsKeyOffer}:payout`, conv.payout);

                // Also Pub Stats?
                pipe.incr(`${statsKeyPub}:conversions`);
                pipe.incrbyfloat(`${statsKeyPub}:revenue`, conv.amount);
                pipe.incrbyfloat(`${statsKeyPub}:payout`, conv.payout);

                await pipe.exec();

                // Cleanup Conversion Key
                await redis.del(`conversion:${conv.click_uuid}`);

                logger.info(`✅ Pending Conversion Processed & Stats Updated (Redis): ${conv.click_uuid}`);

            } catch (insertErr) {
                logger.error(`Failed to process pending conversion for ${clicks[i].click_uuid}`, insertErr);
            }
        }
    }
}

import { v4 as uuidv4 } from 'uuid';

// Dead Letter Queue for failed inserts
async function moveToDeadLetterQueue(clicks, error) {
    try {
        const dlqKey = 'dlq:clicks';
        const pipeline = redis.pipeline();

        for (const click of clicks) {
            const dlqEntry = {
                click_uuid: click.click_uuid,
                error: error.message,
                sqlMessage: error.sqlMessage,
                code: error.code,
                timestamp: new Date().toISOString(),
                clickData: JSON.stringify(click)
            };
            pipeline.lpush(dlqKey, JSON.stringify(dlqEntry));
        }

        await pipeline.exec();
        logger.warn(`📋 Moved ${clicks.length} clicks to DLQ`);
    } catch (dlqErr) {
        logger.error('❌ Failed to move clicks to DLQ:', dlqErr);
    }
}

// Recovery function to reprocess DLQ entries
async function recoverFromDeadLetterQueue() {
    try {
        const dlqKey = 'dlq:clicks';
        const dlqLength = await redis.llen(dlqKey);

        if (dlqLength === 0) {
            logger.info('✅ DLQ is empty');
            return;
        }

        logger.info(`🔄 Recovering ${dlqLength} entries from DLQ`);

        const entries = await redis.lrange(dlqKey, 0, 99); // Process up to 100 at a time

        for (const entryStr of entries) {
            try {
                const entry = JSON.parse(entryStr);
                const clickData = JSON.parse(entry.clickData);

                // Try to insert the click again
                await bulkInsertClicks([clickData]);

                // If successful, remove from DLQ
                await redis.lrem(dlqKey, 1, entryStr);
                logger.info(`✅ Recovered click: ${clickData.click_uuid}`);

            } catch (recoverErr) {
                logger.error(`❌ Recovery failed for DLQ entry: ${entryStr}`, recoverErr);
                // Leave in DLQ for manual inspection
            }
        }

    } catch (err) {
        logger.error('❌ DLQ recovery failed:', err);
    }
}

// Manual recovery endpoint (can be called periodically)
export { recoverFromDeadLetterQueue };

// Auto-start if running directly
if (process.argv[1] === import.meta.url || process.argv[1].endsWith('redisWorker.js')) {
    runWorker();
}

export default runWorker;
