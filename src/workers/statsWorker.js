import redis from '../config/redis.js';
import pool from '../db/connection.js';
import logger from '../utils/logger.js';

const FLUSH_INTERVAL = 10000; // 10 seconds

async function flushStats() {
    try {
        const pattern = 'stats:offer:*:*:*'; // id:date:metric
        let cursor = '0';
        const keys = [];

        // Scan all relevant stats keys
        do {
            const reply = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 1000);
            cursor = reply[0];
            keys.push(...reply[1]);
        } while (cursor !== '0');

        if (keys.length === 0) return;

        // Group by Offer+Date
        // Key format: stats:offer:{id}:{date}:{metric}
        const updates = {}; // { "15:2023-10-27": { clicks: 0, conversions: 0, revenue: 0, payout: 0 } }

        const pipeline = redis.pipeline();

        // Atomic GETSET to retrieve delta and reset to 0
        for (const key of keys) {
            pipeline.getset(key, '0');
        }

        const results = await pipeline.exec();

        // Process Results
        for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            const [err, valStr] = results[i];
            const val = parseFloat(valStr || '0');

            if (val > 0) {
                const parts = key.split(':');
                // parts[0]=stats, [1]=offer, [2]=ID, [3]=DATE, [4]=METRIC
                const offerId = parts[2];
                const date = parts[3];
                const metric = parts[4];
                const groupKey = `${offerId}:${date}`;

                if (!updates[groupKey]) {
                    updates[groupKey] = { offerId, date, clicks: 0, conversions: 0, revenue: 0, payout: 0 };
                }

                updates[groupKey][metric] = (updates[groupKey][metric] || 0) + val;
            }
        }

        const updateList = Object.values(updates);
        if (updateList.length === 0) return;

        logger.info(`📊 Flushing Stats for ${updateList.length} offers...`);

        // Generate a single timestamp for the entire batch to ensure consistency
        const batchTimestamp = new Date();

        // Bulk Upsert into MySQL
        // We do one query per row or construct a complex INSERT ... ON DUPLICATE KEY UPDATE
        // For simplicity and safety, sequential async queries (batched) or a transaction.
        // Given low number of offers (usually <100 active), Promise.all is fine.

        await Promise.all(updateList.map(async (stat) => {
            const profit = stat.revenue - stat.payout;
            // Note: We use `clicks = clicks + ?` because we are flushing DELTAS
            const sql = `
                INSERT INTO daily_offer_stats (offer_id, day, clicks, conversions, revenue, payout, profit, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                    clicks = daily_offer_stats.clicks + ?,
                    conversions = daily_offer_stats.conversions + ?,
                    revenue = daily_offer_stats.revenue + ?,
                    payout = daily_offer_stats.payout + ?,
                    profit = daily_offer_stats.profit + ?,
                    updated_at = ?
            `;
            const params = [
                stat.offerId, stat.date, stat.clicks, stat.conversions, stat.revenue, stat.payout, profit,
                batchTimestamp, batchTimestamp,
                stat.clicks, stat.conversions, stat.revenue, stat.payout, profit, batchTimestamp
            ];

            await pool.query(sql, params);
        }));

        logger.info('✅ Stats Flushed to DB');

    } catch (err) {
        logger.error('Stats Flush Error:', err);
    }
}

function startStatsWorker() {
    logger.info('📉 Stats Worker Started (10s interval)');
    setInterval(flushStats, FLUSH_INTERVAL);
}

export default startStatsWorker;
