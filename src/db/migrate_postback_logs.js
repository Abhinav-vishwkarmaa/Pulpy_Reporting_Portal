import pool from '../db/connection.js';
import logger from '../utils/logger.js';

async function migrate() {
    try {
        logger.info('Starting migration: Create affiliate_postback_logs table');

        await pool.query(`
      CREATE TABLE IF NOT EXISTS affiliate_postback_logs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        publisher_id INT NOT NULL,
        conversion_id INT NULL,
        affiliate_click_id VARCHAR(255),
        fired_url TEXT NOT NULL,
        http_status INT,
        response_body TEXT,
        error_message TEXT,
        execution_time_ms INT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_publisher (publisher_id),
        INDEX idx_conversion (conversion_id),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

        logger.info('Migration completed successfully');
        process.exit(0);
    } catch (error) {
        logger.error('Migration failed:', error);
        process.exit(1);
    }
}

migrate();
