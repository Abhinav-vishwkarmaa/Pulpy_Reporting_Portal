import pool from '../db/connection.js';
import logger from '../utils/logger.js';

export class AdminLoggingService {
  /**
   * Log a change to an entity
   */
  async logChange(entityType, entityId, action, adminUserId, changes = {}) {
    try {
      for (const [fieldName, { oldValue, newValue }] of Object.entries(changes)) {
        await pool.query(
          `INSERT INTO change_logs (
            entity_type, entity_id, action, admin_user_id,
            field_name, old_value, new_value, change_summary, metadata
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            entityType,
            entityId,
            action,
            adminUserId,
            fieldName,
            oldValue !== undefined ? String(oldValue) : null,
            newValue !== undefined ? String(newValue) : null,
            `${action} ${fieldName}: ${oldValue} → ${newValue}`,
            JSON.stringify({}),
          ]
        );
      }
    } catch (error) {
      logger.error('AdminLoggingService.logChange error:', error);
    }
  }

  /**
   * Log tracking event (click/impression/conversion)
   */
  async logTrackingEvent(eventType, data) {
    try {
      await pool.query(
        `INSERT INTO tracking_logs (
          event_type, click_id, conversion_id, offer_id, publisher_id,
          ip, user_agent, referrer, country, device_type, browser, os,
          status, amount, payout, request_data, response_data, processing_time_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          eventType,
          data.click_id || null,
          data.conversion_id || null,
          data.offer_id,
          data.publisher_id,
          data.ip || null,
          data.user_agent || null,
          data.referrer || null,
          data.country || null,
          data.device_type || null,
          data.browser || null,
          data.os || null,
          data.status || null,
          data.amount || null,
          data.payout || null,
          JSON.stringify(data.request_data || {}),
          JSON.stringify(data.response_data || {}),
          data.processing_time_ms || null,
        ]
      );
    } catch (error) {
      logger.error('AdminLoggingService.logTrackingEvent error:', error);
    }
  }

  /**
   * Log postback attempt
   */
  async logPostback(conversionId, publisherId, callbackUrl, requestMethod, requestPayload, responseStatus, responseBody, attemptNumber, success, errorMessage, processingTimeMs) {
    try {
      await pool.query(
        `INSERT INTO postback_logs (
          conversion_id, publisher_id, callback_url, request_method, request_payload,
          response_status, response_body, attempt_number, success, error_message, processing_time_ms
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          conversionId,
          publisherId,
          callbackUrl,
          requestMethod,
          requestPayload,
          responseStatus,
          responseBody,
          attemptNumber,
          success ? 1 : 0,
          errorMessage || null,
          processingTimeMs || null,
        ]
      );
    } catch (error) {
      logger.error('AdminLoggingService.logPostback error:', error);
    }
  }

  /**
   * Log admin action
   */
  async logAdminAction(adminUserId, actionType, targetType, targetId, actionDetails, ipAddress, userAgent, success = true, errorMessage = null) {
    try {
      await pool.query(
        `INSERT INTO admin_action_logs (
          admin_user_id, action_type, target_type, target_id,
          action_details, ip_address, user_agent, success, error_message
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          adminUserId,
          actionType,
          targetType,
          targetId,
          JSON.stringify(actionDetails || {}),
          ipAddress || null,
          userAgent || null,
          success ? 1 : 0,
          errorMessage || null,
        ]
      );
    } catch (error) {
      logger.error('AdminLoggingService.logAdminAction error:', error);
    }
  }

  /**
   * Create admin force action
   */
  async createForceAction(adminUserId, actionType, targetType, targetId, actionData, reason, expiresAt = null) {
    try {
      const [result] = await pool.query(
        `INSERT INTO admin_force_actions (
          admin_user_id, action_type, target_type, target_id,
          action_data, reason, expires_at, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
        [
          adminUserId,
          actionType,
          targetType,
          targetId,
          JSON.stringify(actionData || {}),
          reason || null,
          expiresAt || null,
        ]
      );

      const insertId = result.insertId || result[0]?.insertId;
      const [rows] = await pool.query('SELECT * FROM admin_force_actions WHERE id = ?', [insertId]);
      return Array.isArray(rows) ? rows[0] : rows;
    } catch (error) {
      logger.error('AdminLoggingService.createForceAction error:', error);
      throw error;
    }
  }

  /**
   * Get change logs
   */
  async getChangeLogs(filters = {}) {
    try {
      let query = `SELECT cl.*, au.email as admin_email, au.name as admin_name
                   FROM change_logs cl
                   JOIN admin_users au ON cl.admin_user_id = au.id
                   WHERE 1=1`;
      const params = [];

      if (filters.entity_type) {
        query += ` AND cl.entity_type = ?`;
        params.push(filters.entity_type);
      }

      if (filters.entity_id) {
        query += ` AND cl.entity_id = ?`;
        params.push(filters.entity_id);
      }

      if (filters.action) {
        query += ` AND cl.action = ?`;
        params.push(filters.action);
      }

      if (filters.start_date) {
        query += ` AND cl.created_at >= ?`;
        params.push(filters.start_date);
      }

      if (filters.end_date) {
        query += ` AND cl.created_at <= ?`;
        params.push(filters.end_date);
      }

      query += ` ORDER BY cl.created_at DESC LIMIT ? OFFSET ?`;
      params.push(filters.limit || 100, filters.offset || 0);

      const [rows] = await pool.query(query, params);
      return Array.isArray(rows) ? rows : [];
    } catch (error) {
      logger.error('AdminLoggingService.getChangeLogs error:', error);
      throw error;
    }
  }

  /**
   * Get tracking logs
   */
  async getTrackingLogs(filters = {}) {
    try {
      let query = `SELECT * FROM tracking_logs WHERE 1=1`;
      const params = [];

      if (filters.event_type) {
        query += ` AND event_type = ?`;
        params.push(filters.event_type);
      }

      if (filters.offer_id) {
        query += ` AND offer_id = ?`;
        params.push(filters.offer_id);
      }

      if (filters.publisher_id) {
        query += ` AND publisher_id = ?`;
        params.push(filters.publisher_id);
      }

      if (filters.start_date) {
        query += ` AND created_at >= ?`;
        params.push(filters.start_date);
      }

      if (filters.end_date) {
        query += ` AND created_at <= ?`;
        params.push(filters.end_date);
      }

      query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      params.push(filters.limit || 100, filters.offset || 0);

      const [rows] = await pool.query(query, params);
      return Array.isArray(rows) ? rows : [];
    } catch (error) {
      logger.error('AdminLoggingService.getTrackingLogs error:', error);
      throw error;
    }
  }

  /**
   * Get postback logs
   */
  async getPostbackLogs(filters = {}) {
    try {
      let query = `SELECT pl.*, p.email as publisher_email
                   FROM postback_logs pl
                   JOIN publishers p ON pl.publisher_id = p.id
                   WHERE 1=1`;
      const params = [];

      if (filters.conversion_id) {
        query += ` AND pl.conversion_id = ?`;
        params.push(filters.conversion_id);
      }

      if (filters.publisher_id) {
        query += ` AND pl.publisher_id = ?`;
        params.push(filters.publisher_id);
      }

      if (filters.success !== undefined) {
        query += ` AND pl.success = ?`;
        params.push(filters.success ? 1 : 0);
      }

      if (filters.start_date) {
        query += ` AND pl.created_at >= ?`;
        params.push(filters.start_date);
      }

      query += ` ORDER BY pl.created_at DESC LIMIT ? OFFSET ?`;
      params.push(filters.limit || 100, filters.offset || 0);

      const [rows] = await pool.query(query, params);
      return Array.isArray(rows) ? rows : [];
    } catch (error) {
      logger.error('AdminLoggingService.getPostbackLogs error:', error);
      throw error;
    }
  }

  /**
   * Get admin action logs
   */
  async getAdminActionLogs(filters = {}) {
    try {
      let query = `SELECT al.*, au.email as admin_email, au.name as admin_name
                   FROM admin_action_logs al
                   JOIN admin_users au ON al.admin_user_id = au.id
                   WHERE 1=1`;
      const params = [];

      if (filters.admin_user_id) {
        query += ` AND al.admin_user_id = ?`;
        params.push(filters.admin_user_id);
      }

      if (filters.action_type) {
        query += ` AND al.action_type = ?`;
        params.push(filters.action_type);
      }

      if (filters.target_type) {
        query += ` AND al.target_type = ?`;
        params.push(filters.target_type);
      }

      if (filters.start_date) {
        query += ` AND al.created_at >= ?`;
        params.push(filters.start_date);
      }

      query += ` ORDER BY al.created_at DESC LIMIT ? OFFSET ?`;
      params.push(filters.limit || 100, filters.offset || 0);

      const [rows] = await pool.query(query, params);
      return Array.isArray(rows) ? rows : [];
    } catch (error) {
      logger.error('AdminLoggingService.getAdminActionLogs error:', error);
      throw error;
    }
  }
}

export default new AdminLoggingService();
