import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import https from 'https';
import http from 'http';

export class PostbackRetryService {
  /**
   * Add postback to retry queue
   */
  async addToQueue(conversionId, publisherId, callbackUrl, requestMethod = 'GET', requestPayload, priority = 5, maxAttempts = 5) {
    try {
      // Calculate initial retry delay (exponential backoff: 1min, 5min, 15min, 1hour, 6hours)
      const nextRetryAt = new Date(Date.now() + 60 * 1000); // 1 minute initial delay

      const [result] = await pool.query(
        `INSERT INTO postback_queue (
          conversion_id, publisher_id, callback_url, request_method, request_payload,
          priority, max_attempts, current_attempt, next_retry_at, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, 'pending')
        ON DUPLICATE KEY UPDATE
          callback_url = VALUES(callback_url),
          request_payload = VALUES(request_payload),
          priority = VALUES(priority),
          updated_at = NOW()`,
        [conversionId, publisherId, callbackUrl, requestMethod, requestPayload, priority, maxAttempts, nextRetryAt]
      );

      const insertId = result.insertId || result[0]?.insertId;
      const [rows] = await pool.query('SELECT * FROM postback_queue WHERE id = ?', [insertId]);
      return Array.isArray(rows) ? rows[0] : rows;
    } catch (error) {
      logger.error('PostbackRetryService.addToQueue error:', error);
      throw error;
    }
  }

  /**
   * Process postback retry (called by queue worker)
   */
  async processRetry(queueId) {
    try {
      // Get queue item
      const [queueRows] = await pool.query('SELECT * FROM postback_queue WHERE id = ?', [queueId]);
      const queueItem = Array.isArray(queueRows) ? queueRows[0] : queueRows;

      if (!queueItem || queueItem.status !== 'pending') {
        return { success: false, error: 'Queue item not found or not pending' };
      }

      // Update status to processing
      await pool.query('UPDATE postback_queue SET status = ?, updated_at = NOW() WHERE id = ?', ['processing', queueId]);

      const attemptNumber = queueItem.current_attempt + 1;
      const startTime = Date.now();

      try {
        // Send postback
        const result = await this.sendPostback(
          queueItem.callback_url,
          queueItem.request_method,
          queueItem.request_payload
        );

        const responseTime = Date.now() - startTime;

        // Log attempt
        await pool.query(
          `INSERT INTO postback_attempts (
            queue_id, attempt_number, request_url, request_method, request_payload,
            response_status, response_body, response_time_ms, success, error_message
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            queueId,
            attemptNumber,
            queueItem.callback_url,
            queueItem.request_method,
            queueItem.request_payload,
            result.status,
            result.body,
            responseTime,
            result.success ? 1 : 0,
            result.error || null,
          ]
        );

        if (result.success) {
          // Success - mark as completed
          await pool.query(
            `UPDATE postback_queue 
             SET status = 'completed', current_attempt = ?, completed_at = NOW(), updated_at = NOW()
             WHERE id = ?`,
            [attemptNumber, queueId]
          );

          return { success: true, completed: true };
        } else {
          // Failed - check if we should retry
          if (attemptNumber >= queueItem.max_attempts) {
            // Max attempts reached - mark as failed
            await pool.query(
              `UPDATE postback_queue 
               SET status = 'failed', current_attempt = ?, last_error = ?, updated_at = NOW()
               WHERE id = ?`,
              [attemptNumber, result.error || 'Max attempts reached', queueId]
            );

            // Check if this is a permanent failure pattern
            await this.checkPermanentFailure(queueItem.publisher_id, queueItem.callback_url, result.error);

            return { success: false, failed: true, error: result.error };
          } else {
            // Calculate next retry delay (exponential backoff)
            const retryDelays = [60, 300, 900, 3600, 21600]; // 1min, 5min, 15min, 1hr, 6hr
            const delaySeconds = retryDelays[Math.min(attemptNumber - 1, retryDelays.length - 1)];
            const nextRetryAt = new Date(Date.now() + delaySeconds * 1000);

            await pool.query(
              `UPDATE postback_queue 
               SET status = 'pending', current_attempt = ?, next_retry_at = ?, last_error = ?, updated_at = NOW()
               WHERE id = ?`,
              [attemptNumber, nextRetryAt, result.error || 'Retry scheduled', queueId]
            );

            return { success: false, retryScheduled: true, nextRetryAt };
          }
        }
      } catch (error) {
        const responseTime = Date.now() - startTime;

        // Log failed attempt
        await pool.query(
          `INSERT INTO postback_attempts (
            queue_id, attempt_number, request_url, request_method, request_payload,
            response_status, response_body, response_time_ms, success, error_message
          ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, 0, ?)`,
          [queueId, attemptNumber, queueItem.callback_url, queueItem.request_method, queueItem.request_payload, responseTime, error.message]
        );

        if (attemptNumber >= queueItem.max_attempts) {
          await pool.query(
            `UPDATE postback_queue 
             SET status = 'failed', current_attempt = ?, last_error = ?, updated_at = NOW()
             WHERE id = ?`,
            [attemptNumber, error.message, queueId]
          );
          return { success: false, failed: true, error: error.message };
        } else {
          const retryDelays = [60, 300, 900, 3600, 21600];
          const delaySeconds = retryDelays[Math.min(attemptNumber - 1, retryDelays.length - 1)];
          const nextRetryAt = new Date(Date.now() + delaySeconds * 1000);

          await pool.query(
            `UPDATE postback_queue 
             SET status = 'pending', current_attempt = ?, next_retry_at = ?, last_error = ?, updated_at = NOW()
             WHERE id = ?`,
            [attemptNumber, nextRetryAt, error.message, queueId]
          );

          return { success: false, retryScheduled: true, nextRetryAt };
        }
      }
    } catch (error) {
      logger.error('PostbackRetryService.processRetry error:', error);
      throw error;
    }
  }

  /**
   * Send postback HTTP request
   */
  async sendPostback(callbackUrl, method, payload) {
    return new Promise((resolve) => {
      try {
        const urlObj = new URL(callbackUrl);
        const client = urlObj.protocol === 'https:' ? https : http;
        const timeout = 10000; // 10 seconds

        const options = {
          hostname: urlObj.hostname,
          port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
          path: urlObj.pathname + urlObj.search,
          method: method.toUpperCase(),
          timeout,
          headers: method.toUpperCase() === 'POST' ? {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(payload || ''),
          } : {},
        };

        const req = client.request(options, (res) => {
          let body = '';
          res.on('data', (chunk) => { body += chunk; });
          res.on('end', () => {
            const success = res.statusCode >= 200 && res.statusCode < 300;
            resolve({
              success,
              status: res.statusCode,
              body: body.substring(0, 1000), // Limit body size
              error: success ? null : `HTTP ${res.statusCode}`,
            });
          });
        });

        req.on('error', (error) => {
          resolve({
            success: false,
            status: null,
            body: null,
            error: error.message,
          });
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({
            success: false,
            status: null,
            body: null,
            error: 'Request timeout',
          });
        });

        if (method.toUpperCase() === 'POST' && payload) {
          req.write(payload);
        }

        req.end();
      } catch (error) {
        resolve({
          success: false,
          status: null,
          body: null,
          error: error.message,
        });
      }
    });
  }

  /**
   * Check for permanent failure patterns
   */
  async checkPermanentFailure(publisherId, callbackUrl, errorMessage) {
    try {
      const urlObj = new URL(callbackUrl);
      const domain = urlObj.hostname;

      // Determine failure type
      let failureType = 'other';
      if (errorMessage.includes('timeout')) failureType = 'timeout';
      else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('ENOTFOUND')) failureType = 'connection_error';
      else if (errorMessage.startsWith('HTTP')) failureType = 'http_error';

      // Update or create failure pattern
      await pool.query(
        `INSERT INTO postback_failure_patterns (
          publisher_id, callback_domain, failure_type, error_code, failure_count, last_failure_at
        ) VALUES (?, ?, ?, ?, 1, NOW())
        ON DUPLICATE KEY UPDATE
          failure_count = failure_count + 1,
          last_failure_at = NOW(),
          is_permanent_failure = CASE WHEN failure_count >= 10 THEN 1 ELSE is_permanent_failure END`,
        [publisherId, domain, failureType, errorMessage]
      );
    } catch (error) {
      logger.error('PostbackRetryService.checkPermanentFailure error:', error);
    }
  }

  /**
   * Get failed postbacks for dashboard
   */
  async getFailedPostbacks(filters = {}) {
    try {
      let query = `SELECT pq.*, c.conversion_uuid, p.email as publisher_email
                   FROM postback_queue pq
                   JOIN conversions c ON pq.conversion_id = c.id
                   JOIN publishers p ON pq.publisher_id = p.id
                   WHERE pq.status IN ('pending', 'failed')`;
      const params = [];

      if (filters.publisher_id) {
        query += ` AND pq.publisher_id = ?`;
        params.push(filters.publisher_id);
      }

      if (filters.status) {
        query += ` AND pq.status = ?`;
        params.push(filters.status);
      }

      query += ` ORDER BY pq.priority DESC, pq.next_retry_at ASC LIMIT ? OFFSET ?`;
      params.push(filters.limit || 100, filters.offset || 0);

      const [rows] = await pool.query(query, params);
      return Array.isArray(rows) ? rows : [];
    } catch (error) {
      logger.error('PostbackRetryService.getFailedPostbacks error:', error);
      throw error;
    }
  }

  /**
   * Get queue items ready for retry
   */
  async getQueueItemsReadyForRetry(limit = 100) {
    try {
      const [rows] = await pool.query(
        `SELECT * FROM postback_queue 
         WHERE status = 'pending' 
         AND next_retry_at <= NOW()
         AND current_attempt < max_attempts
         ORDER BY priority DESC, next_retry_at ASC
         LIMIT ?`,
        [limit]
      );
      return Array.isArray(rows) ? rows : [];
    } catch (error) {
      logger.error('PostbackRetryService.getQueueItemsReadyForRetry error:', error);
      throw error;
    }
  }
}

export default new PostbackRetryService();
