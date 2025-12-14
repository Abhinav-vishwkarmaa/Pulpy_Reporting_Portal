import pool from '../db/connection.js';
import logger from '../utils/logger.js';
import crypto from 'crypto';

export class SecurityService {
  /**
   * Check API rate limit
   */
  async checkRateLimit(identifier, endpoint, maxRequests, windowSeconds) {
    try {
      const now = new Date();
      const windowStart = new Date(now.getTime() - windowSeconds * 1000);

      // Get or create rate limit record
      const [rows] = await pool.query(
        `SELECT * FROM api_rate_limits 
         WHERE identifier = ? AND endpoint = ? AND window_start >= ?`,
        [identifier, endpoint, windowStart]
      );
      const record = Array.isArray(rows) ? rows[0] : rows;

      if (record) {
        // Check if blocked
        if (record.blocked_until && new Date(record.blocked_until) > now) {
          return {
            allowed: false,
            blocked: true,
            blockedUntil: record.blocked_until,
            remaining: 0,
          };
        }

        // Check if limit exceeded
        if (record.request_count >= maxRequests) {
          // Block for window duration
          const blockedUntil = new Date(now.getTime() + windowSeconds * 1000);
          await pool.query(
            `UPDATE api_rate_limits 
             SET blocked_until = ?, updated_at = NOW() 
             WHERE id = ?`,
            [blockedUntil, record.id]
          );

          return {
            allowed: false,
            blocked: true,
            blockedUntil,
            remaining: 0,
          };
        }

        // Increment count
        await pool.query(
          `UPDATE api_rate_limits 
           SET request_count = request_count + 1, updated_at = NOW() 
           WHERE id = ?`,
          [record.id]
        );

        return {
          allowed: true,
          blocked: false,
          remaining: maxRequests - record.request_count - 1,
        };
      } else {
        // Create new record
        await pool.query(
          `INSERT INTO api_rate_limits (identifier, endpoint, request_count, window_start)
           VALUES (?, ?, 1, ?)`,
          [identifier, endpoint, now]
        );

        return {
          allowed: true,
          blocked: false,
          remaining: maxRequests - 1,
        };
      }
    } catch (error) {
      logger.error('SecurityService.checkRateLimit error:', error);
      // On error, allow (don't block)
      return { allowed: true, blocked: false, remaining: maxRequests };
    }
  }

  /**
   * Validate advertiser postback signature
   */
  async validatePostbackSignature(advertiserId, payload, signature, algorithm = 'sha256') {
    try {
      // Get advertiser secret
      const [rows] = await pool.query(
        `SELECT secret_key FROM advertiser_signatures 
         WHERE advertiser_id = ? AND is_active = 1 
         ORDER BY created_at DESC LIMIT 1`,
        [advertiserId]
      );
      const secretRecord = Array.isArray(rows) ? rows[0] : rows;

      if (!secretRecord) {
        return { valid: false, error: 'No signature secret found for advertiser' };
      }

      // Generate expected signature
      const hmac = crypto.createHmac(algorithm, secretRecord.secret_key);
      hmac.update(JSON.stringify(payload));
      const expectedSignature = hmac.digest('hex');

      // Compare signatures (constant-time comparison)
      const isValid = crypto.timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );

      return {
        valid: isValid,
        error: isValid ? null : 'Invalid signature',
      };
    } catch (error) {
      logger.error('SecurityService.validatePostbackSignature error:', error);
      return { valid: false, error: error.message };
    }
  }

  /**
   * Check IP throttle
   */
  async checkIPThrottle(ip, eventType, maxRequests, windowSeconds) {
    try {
      const now = new Date();
      const windowStart = new Date(now.getTime() - windowSeconds * 1000);

      const [rows] = await pool.query(
        `SELECT * FROM ip_throttle_logs 
         WHERE ip = ? AND event_type = ? AND window_start >= ?`,
        [ip, eventType, windowStart]
      );
      const record = Array.isArray(rows) ? rows[0] : rows;

      if (record) {
        if (record.blocked_until && new Date(record.blocked_until) > now) {
          return { allowed: false, blocked: true };
        }

        if (record.request_count >= maxRequests) {
          const blockedUntil = new Date(now.getTime() + windowSeconds * 1000);
          await pool.query(
            `UPDATE ip_throttle_logs 
             SET blocked_until = ?, request_count = request_count + 1 
             WHERE id = ?`,
            [blockedUntil, record.id]
          );
          return { allowed: false, blocked: true };
        }

        await pool.query(
          `UPDATE ip_throttle_logs 
           SET request_count = request_count + 1 
           WHERE id = ?`,
          [record.id]
        );
        return { allowed: true, blocked: false };
      } else {
        await pool.query(
          `INSERT INTO ip_throttle_logs (ip, event_type, request_count, window_start)
           VALUES (?, ?, 1, ?)`,
          [ip, eventType, now]
        );
        return { allowed: true, blocked: false };
      }
    } catch (error) {
      logger.error('SecurityService.checkIPThrottle error:', error);
      return { allowed: true, blocked: false };
    }
  }

  /**
   * Rotate JWT token version
   */
  async rotateJWTToken(userId, userType) {
    try {
      const [rows] = await pool.query(
        `SELECT token_version FROM jwt_token_versions 
         WHERE user_id = ? AND user_type = ? AND is_revoked = 0
         ORDER BY created_at DESC LIMIT 1`,
        [userId, userType]
      );
      const record = Array.isArray(rows) ? rows[0] : rows;

      const newVersion = record ? record.token_version + 1 : 1;

      await pool.query(
        `INSERT INTO jwt_token_versions (user_id, user_type, token_version, last_rotated_at)
         VALUES (?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE
           token_version = VALUES(token_version),
           last_rotated_at = NOW()`,
        [userId, userType, newVersion]
      );

      return { version: newVersion };
    } catch (error) {
      logger.error('SecurityService.rotateJWTToken error:', error);
      throw error;
    }
  }

  /**
   * Validate JWT token version
   */
  async validateJWTTokenVersion(userId, userType, tokenVersion) {
    try {
      const [rows] = await pool.query(
        `SELECT * FROM jwt_token_versions 
         WHERE user_id = ? AND user_type = ? AND token_version = ? AND is_revoked = 0`,
        [userId, userType, tokenVersion]
      );
      const record = Array.isArray(rows) ? rows[0] : rows;

      return { valid: !!record };
    } catch (error) {
      logger.error('SecurityService.validateJWTTokenVersion error:', error);
      return { valid: false };
    }
  }

  /**
   * Secure macro parsing (sanitize macro values)
   */
  parseMacros(macroString, values) {
    try {
      let parsed = macroString;
      const securityFlags = [];

      for (const [key, value] of Object.entries(values)) {
        // Sanitize value (prevent injection)
        const sanitized = String(value || '')
          .replace(/[<>'"&]/g, '') // Remove dangerous characters
          .substring(0, 500); // Limit length

        const regex = new RegExp(`\\{${key}\\}`, 'gi');
        parsed = parsed.replace(regex, sanitized);

        // Check for suspicious patterns
        if (value && (value.includes('<script') || value.includes('javascript:'))) {
          securityFlags.push({ macro: key, warning: 'Potential XSS detected' });
        }
      }

      return {
        parsed,
        securityFlags,
      };
    } catch (error) {
      logger.error('SecurityService.parseMacros error:', error);
      return { parsed: macroString, securityFlags: [] };
    }
  }
}

export default new SecurityService();
