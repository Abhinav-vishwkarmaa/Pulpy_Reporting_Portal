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

            const validEntries = [];
            const invalidEntries = [];

            for (let i = 0; i < dataResults.length; i++) {
                const [err, clickData] = dataResults[i];
                const clickUuid = clickIds[i] || null;

                if (!err && clickData && clickData.offer_id) {
                    validEntries.push({
                        msgId: msgIds[i],
                        clickUuid,
                        clickData
                    });
                } else {
                    const validationErrors = [];
                    if (err) validationErrors.push(err.message);
                    if (!clickData || !clickData.offer_id) validationErrors.push('missing click payload or offer_id');

                    invalidEntries.push({
                        msgId: msgIds[i],
                        clickUuid,
                        clickData: clickData || null,
                        errors: validationErrors
                    });
                    logger.warn(`Click data invalid/missing for ID: ${clickUuid || 'unknown'}`, validationErrors);
                }
            }

            if (invalidEntries.length > 0) {
                await moveToDeadLetterQueue(invalidEntries, {
                    reason: 'validation_error',
                    context: {
                        stream: STREAM_KEY,
                        group: GROUP_NAME,
                        consumer: CONSUMER_NAME,
                        batchSize: streamEntries.length
                    }
                });

                const invalidPipeline = redis.pipeline();
                const invalidMsgIds = invalidEntries.map(entry => entry.msgId);
                invalidPipeline.xack(STREAM_KEY, GROUP_NAME, ...invalidMsgIds);
                invalidEntries.forEach(entry => {
                    if (entry.clickUuid) {
                        invalidPipeline.del(`click:${entry.clickUuid}`);
                    }
                });
                await invalidPipeline.exec();
            }

            if (validEntries.length === 0) {
                continue;
            }

            const validMsgIds = validEntries.map(entry => entry.msgId);
            const validClicks = validEntries.map(entry => entry.clickData);
            const clickIdsToCleanup = validEntries.map(entry => entry.clickData.click_uuid);
            const batchTimestamp = new Date();

            let retryCount = 0;
            let insertSuccess = false;

            while (retryCount < MAX_RETRY_ATTEMPTS && !insertSuccess) {
                try {
                    await bulkInsertClicks(validClicks, batchTimestamp);
                    insertSuccess = true;

                    await processPendingConversions(validClicks, batchTimestamp);

                    const pipelineStats = redis.pipeline();
                    const today = new Date().toISOString().split('T')[0];
                    for (const c of validClicks) {
                        pipelineStats.incr(`stats:offer:${c.offer_id}:${today}:clicks`);
                        pipelineStats.incr(`stats:pub:${c.publisher_id}:${today}:clicks`);
                    }
                    await pipelineStats.exec();

                    const cleanupPipeline = redis.pipeline();
                    cleanupPipeline.xack(STREAM_KEY, GROUP_NAME, ...validMsgIds);
                    clickIdsToCleanup.forEach(id => cleanupPipeline.del(`click:${id}`));
                    await cleanupPipeline.exec();

                    logger.info(`✅ Processed Batch: ${validClicks.length} clicks`);

                } catch (dbErr) {
                    retryCount++;
                    const isLastAttempt = retryCount >= MAX_RETRY_ATTEMPTS;

                    logger.error(`❌ BATCH DB INSERT FAILED - ATTEMPT ${retryCount}/${MAX_RETRY_ATTEMPTS}`, {
                        error: dbErr.message,
                        code: dbErr.code,
                        errno: dbErr.errno,
                        sqlState: dbErr.sqlState,
                        sqlMessage: dbErr.sqlMessage,
                        stream: STREAM_KEY,
                        group: GROUP_NAME,
                        consumer: CONSUMER_NAME,
                        batchSize: validClicks.length,
                        sampleMsgId: validEntries[0]?.msgId,
                        nextAction: isLastAttempt ? 'MOVE_TO_DLQ' : 'RETRY_WITH_BACKOFF'
                    });

                    if (isLastAttempt) {
                        await moveToDeadLetterQueue(validEntries, {
                            reason: 'db_insert_failure',
                            error: dbErr,
                            context: {
                                stream: STREAM_KEY,
                                group: GROUP_NAME,
                                consumer: CONSUMER_NAME,
                                batchSize: validClicks.length
                            }
                        });

                        await redis.xack(STREAM_KEY, GROUP_NAME, ...validMsgIds);
                        const cleanupPipeline = redis.pipeline();
                        clickIdsToCleanup.forEach(id => cleanupPipeline.del(`click:${id}`));
                        await cleanupPipeline.exec();

                        logger.error('❌ MAX RETRIES EXCEEDED - MOVED TO DLQ AND ACKED');
                    } else {
                        const backoffMs = Math.pow(2, retryCount) * 1000;
                        logger.info(`⏳ RETRYING IN ${backoffMs}ms...`);
                        await new Promise(r => setTimeout(r, backoffMs));
                    }
                }
            }

        } catch (err) {
            logger.error('Worker Error:', err);
            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

async function bulkInsertClicks(clicks, batchTimestamp = new Date()) {
    if (clicks.length === 0) return;

    const sql = `INSERT INTO clicks (
        click_uuid, offer_id, publisher_id, publisher_offer_id,
        ip, user_agent, referrer, country, region, city, isp, location, domain,
        device_type, browser, os, os_version, device_brand, device_model,
        source_id, device_id, google_id, android_id, rcid, tid,
        timestamp, created_at
    ) VALUES ?
    ON DUPLICATE KEY UPDATE id = id`;

    const values = clicks.map(c => [
        c.click_uuid, parseInt(c.offer_id), parseInt(c.publisher_id), c.publisher_offer_id ? parseInt(c.publisher_offer_id) : null,
        c.ip, c.user_agent, c.referrer, c.country, c.region || null, c.city || null, c.isp || null, c.location || null, c.domain,
        c.device_type, c.browser, c.os, c.os_version, c.device_brand, c.device_model,
        c.source_id || null, c.device_id || null, c.google_id || null, c.android_id || null,
        c.rcid || null, c.tid || null,
        new Date(c.timestamp), batchTimestamp
    ]);

    try {
        await pool.query(sql, [values]);
    } catch (err) {
        logger.error('❌ BULK INSERT FAILED - DETAILED ERROR INFO:', {
            message: err.message,
            code: err.code,
            errno: err.errno,
            sqlState: err.sqlState,
            sqlMessage: err.sqlMessage,
            sql: sql,
            valuesCount: values.length,
            firstValueSample: values[0]
        });
        throw err;
    }
}

async function processPendingConversions(clicks, batchTimestamp = new Date()) {
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
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        uuidv4(), // Generate new DB internal ID or use one if we generated?
                        conv.click_uuid, conv.offer_id, conv.publisher_id, conv.publisher_offer_id,
                        conv.rcid, conv.status, conv.amount, conv.payout, conv.ip,
                        conv.postback_payload, new Date(conv.timestamp), batchTimestamp, batchTimestamp
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
async function moveToDeadLetterQueue(entries, options = {}) {
    try {
        const dlqKey = 'stream:clicks:dlq';
        const pipeline = redis.pipeline();
        const reason = options.reason || 'unknown_failure';
        const context = options.context || {};
        const errorInfo = options.error ? {
            message: options.error.message,
            code: options.error.code,
            errno: options.error.errno,
            sqlState: options.error.sqlState,
            sqlMessage: options.error.sqlMessage
        } : null;

        for (const entry of entries) {
            const payload = {
                click_uuid: entry.clickUuid || entry.click_uuid || entry.clickData?.click_uuid || 'unknown',
                streamId: entry.msgId,
                reason,
                error: errorInfo,
                validationErrors: entry.errors || null,
                context,
                clickData: entry.clickData || {},
                timestamp: new Date().toISOString()
            };
            pipeline.xadd(dlqKey, '*', 'payload', JSON.stringify(payload));
        }

        await pipeline.exec();
        logger.warn(`📋 Moved ${entries.length} entries to DLQ (${reason})`, context);
    } catch (dlqErr) {
        logger.error('❌ Failed to move entries to DLQ:', dlqErr);
    }
}

// Recovery function to reprocess DLQ entries
async function recoverFromDeadLetterQueue() {
    try {
        const dlqKey = 'stream:clicks:dlq';
        const dlqLength = (await redis.xlen(dlqKey));

        if (dlqLength === 0) {
            logger.info('✅ DLQ is empty');
            return;
        }

        logger.info(`🔄 Recovering ${dlqLength} entries from DLQ`);

        const entries = await redis.xrange(dlqKey, '-', '+', 'COUNT', 100);

        for (const [entryId, fields] of entries) {
            try {
                const payload = JSON.parse(fields[1]);
                const clickData = payload.clickData || {};

                await bulkInsertClicks([clickData]);

                await redis.xdel(dlqKey, entryId);
                logger.info(`✅ Recovered click: ${clickData.click_uuid}`);

            } catch (recoverErr) {
                logger.error(`❌ Recovery failed for DLQ entry: ${entryId}`, recoverErr);
            }
        }

    } catch (err) {
        logger.error('❌ DLQ recovery failed:', err);
    }
}

// Manual recovery endpoint (can be called periodically)
export { recoverFromDeadLetterQueue };

export default runWorker;
