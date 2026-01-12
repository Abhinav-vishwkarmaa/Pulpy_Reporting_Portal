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
                // 1. Bulk Insert Clicks to MySQL
                // CRITICAL: We MUST wrap this in try/catch to prevent crashing worker entirely
                // If bulk insert fails, we might process one by one or retry?
                // Ideally, we retry the batch once, then log and maybe move to DLQ.
                // For this implementation, we throw and let the worker retry the loop (Stream provides natural retry if not ACKed)
                try {
                    await bulkInsertClicks(clicksToInsert);

                    // 2. SUCCESS! Now check for Pending Conversions in Redis
                    // For each successfully inserted click, check if a conversion is waiting
                    await processPendingConversions(clicksToInsert);

                    // 3. Stats - Aggregation
                    // We increment Redis counters for stats, not DB directly here.
                    // Separate Stats Worker will flush these.
                    // Implementation:
                    // redis.incr(`stats:offer:${offerId}:${date}:clicks`)
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
                    // We keep them if we want to debug, but high volume = delete.
                    // User said: "Clean Redis keys only after DB success"
                    clickIds.forEach(id => cleanupPipeline.del(`click:${id}`));
                    await cleanupPipeline.exec();

                    logger.info(`✅ Processed Batch: ${clicksToInsert.length} clicks`);

                } catch (dbErr) {
                    logger.error('❌ Batch DB Insert Failed - Will Retry via Stream PEL', dbErr);
                    // Do NOT Ack. Stream delivery count will increase.
                    // Sleep a bit to backoff
                    await new Promise(r => setTimeout(r, 2000));
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

    const sql = `INSERT IGNORE INTO clicks (
        click_uuid, offer_id, publisher_id, publisher_offer_id,
        ip, user_agent, referrer, country, region, city, isp, location, domain,
        device_type, browser, os, os_version, device_brand, device_model,
        source_id, device_id, google_id, android_id, rcid, tid,
        timestamp, created_at
    ) VALUES ?`;

    const values = clicks.map(c => [
        c.click_uuid, c.offer_id, c.publisher_id, c.publisher_offer_id,
        c.ip, c.user_agent, c.referrer, c.country, c.region || null, c.city || null, c.isp || null, c.location || null, c.domain,
        c.device_type, c.browser, c.os, c.os_version, c.device_brand, c.device_model,
        c.source_id || null, c.device_id || null, c.google_id || null, c.android_id || null,
        c.rcid || null, c.tid || null,
        new Date(c.timestamp), new Date() // timestamp, created_at
    ]);

    try {
        await pool.query(sql, [values]);
    } catch (err) {
        logger.error('Bulk Insert Failed', err);
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

// Auto-start if running directly
if (process.argv[1] === import.meta.url || process.argv[1].endsWith('redisWorker.js')) {
    runWorker();
}

export default runWorker;
