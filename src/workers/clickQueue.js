import fastq from 'fastq';
import pool from '../db/connection.js';
import logger from '../utils/logger.js';

// Configuration
const CONCURRENCY = 5; // Strictly limit concurrent DB write chains across logging AND stats
const QUEUE_HIGH_WATER_MARK = 5000;

// Stats logic inside worker to prevent spawning uncontrolled DB tasks
async function updateDailyStats(offerId, publisherId) {
    try {
        // Simplified Logic: Just increment today's clicks.
        // Skipping complex unique headers/IP logic for now to ensure we can handle 150+ req/sec.
        await pool.query(
            `INSERT INTO daily_offer_stats (offer_id, day, clicks)
           VALUES (?, CURDATE(), 1)
           ON DUPLICATE KEY UPDATE 
             clicks = daily_offer_stats.clicks + 1,
             updated_at = UTC_TIMESTAMP()`,
            [offerId]
        );
    } catch (error) {
        logger.error('Worker failed to update stats:', error);
    }
}

// The worker function that processes each task
async function processClick(task, cb) {
    const { data, sql, params, type, startTime } = task;

    try {
        if (type === 'insert_click') {
            const dbStart = Date.now();

            // 1. Insert the Click
            await pool.query(sql, params);

            // 2. Update Stats (in same concurrency slot)
            if (data && data.offerId) {
                await updateDailyStats(data.offerId, data.publisherId);
            }

            const duration = Date.now() - dbStart;
            if (duration > 300) {
                logger.warn(`Slow Worker Task (${duration}ms)`);
            }
        }
    } catch (error) {
        logger.error(`Failed to process async ${type}:`, error);
    } finally {
        cb(null);
    }
}

// Create the queue
export const clickQueue = fastq(processClick, CONCURRENCY);

// Helper to check load
export function isOverloaded() {
    return clickQueue.length() > QUEUE_HIGH_WATER_MARK;
}

// Monitoring
setInterval(() => {
    if (clickQueue.length() > 0) {
        logger.info(`Click Queue: ${clickQueue.length()} pending, ${clickQueue.running()} active`);
    }
}, 3000);
