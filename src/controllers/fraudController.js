import fraudDetectionService from '../services/fraudDetectionService.js';
import logger from '../utils/logger.js';
import { createErrorResponse } from '../utils/errorResponse.js';
import pool from '../db/connection.js';

export class FraudController {
  /**
   * Get fraud logs
   * GET /api/admin/fraud/logs
   */
  async getFraudLogs(request, reply) {
    try {
      const filters = {
        offer_id: request.query.offer_id ? parseInt(request.query.offer_id) : null,
        publisher_id: request.query.publisher_id ? parseInt(request.query.publisher_id) : null,
        event_type: request.query.event_type || null,
        rejection_reason_code: request.query.reason_code || null,
        start_date: request.query.start_date || null,
        end_date: request.query.end_date || null,
        limit: request.query.limit ? parseInt(request.query.limit) : 100,
        offset: request.query.offset ? parseInt(request.query.offset) : 0,
      };

      const logs = await fraudDetectionService.getFraudLogs(filters);

      return reply.send({
        success: true,
        data: logs,
        count: logs.length,
      });
    } catch (error) {
      logger.error('FraudController.getFraudLogs error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  /**
   * Get publisher fraud scores
   * GET /api/admin/fraud/publisher-scores
   */
  async getPublisherFraudScores(request, reply) {
    try {
      const publisherId = request.query.publisher_id ? parseInt(request.query.publisher_id) : null;

      let query = `SELECT pfs.*, p.email as publisher_email, p.company_name as publisher_company
                   FROM publisher_fraud_scores pfs
                   JOIN publishers p ON pfs.publisher_id = p.id`;
      const params = [];

      if (publisherId) {
        query += ` WHERE pfs.publisher_id = ?`;
        params.push(publisherId);
      }

      query += ` ORDER BY pfs.fraud_score DESC LIMIT ? OFFSET ?`;
      params.push(request.query.limit ? parseInt(request.query.limit) : 100, request.query.offset ? parseInt(request.query.offset) : 0);

      const [rows] = await pool.query(query, params);
      const scores = Array.isArray(rows) ? rows : [];

      return reply.send({
        success: true,
        data: scores.map(score => ({
          publisher_id: score.publisher_id,
          publisher_email: score.publisher_email,
          publisher_company: score.publisher_company,
          fraud_score: parseFloat(score.fraud_score),
          risk_level: score.risk_level,
          factors: typeof score.factors === 'string' ? JSON.parse(score.factors) : score.factors,
          last_calculated: score.last_calculated,
        })),
        count: scores.length,
      });
    } catch (error) {
      logger.error('FraudController.getPublisherFraudScores error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  /**
   * Calculate/Recalculate publisher fraud score
   * POST /api/admin/fraud/calculate-score/:publisherId
   */
  async calculatePublisherScore(request, reply) {
    try {
      const publisherId = parseInt(request.params.publisherId);
      
      if (!publisherId) {
        return reply.code(400).send(createErrorResponse(new Error('Publisher ID is required'), 400));
      }

      const result = await fraudDetectionService.calculatePublisherFraudScore(publisherId);

      return reply.send({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('FraudController.calculatePublisherScore error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  /**
   * Get fraud rules
   * GET /api/admin/fraud/rules
   */
  async getFraudRules(request, reply) {
    try {
      const ruleType = request.query.rule_type || null;
      const offerId = request.query.offer_id ? parseInt(request.query.offer_id) : null;
      const publisherId = request.query.publisher_id ? parseInt(request.query.publisher_id) : null;

      let query = `SELECT * FROM fraud_rules WHERE 1=1`;
      const params = [];

      if (ruleType) {
        query += ` AND rule_type = ?`;
        params.push(ruleType);
      }

      if (offerId) {
        query += ` AND (rule_type = 'global' OR (rule_type = 'offer' AND offer_id = ?))`;
        params.push(offerId);
      }

      if (publisherId) {
        query += ` AND (rule_type = 'global' OR (rule_type = 'publisher' AND publisher_id = ?))`;
        params.push(publisherId);
      }

      query += ` ORDER BY rule_type DESC, id ASC`;

      const [rows] = await pool.query(query, params);
      const rules = Array.isArray(rows) ? rows : [];

      return reply.send({
        success: true,
        data: rules.map(rule => ({
          id: rule.id,
          rule_type: rule.rule_type,
          publisher_id: rule.publisher_id,
          offer_id: rule.offer_id,
          rule_name: rule.rule_name,
          rule_config: typeof rule.rule_config === 'string' ? JSON.parse(rule.rule_config) : rule.rule_config,
          action: rule.action,
          is_active: Boolean(rule.is_active),
          created_at: rule.created_at,
          updated_at: rule.updated_at,
        })),
        count: rules.length,
      });
    } catch (error) {
      logger.error('FraudController.getFraudRules error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  /**
   * Create fraud rule
   * POST /api/admin/fraud/rules
   */
  async createFraudRule(request, reply) {
    try {
      const { rule_type, publisher_id, offer_id, rule_name, rule_config, action, is_active } = request.body;

      if (!rule_type || !rule_name || !rule_config || !action) {
        return reply.code(400).send(createErrorResponse(
          new Error('rule_type, rule_name, rule_config, and action are required'),
          400
        ));
      }

      const [result] = await pool.query(
        `INSERT INTO fraud_rules (rule_type, publisher_id, offer_id, rule_name, rule_config, action, is_active)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          rule_type,
          publisher_id || null,
          offer_id || null,
          rule_name,
          JSON.stringify(rule_config),
          action,
          is_active !== undefined ? (is_active ? 1 : 0) : 1,
        ]
      );

      const insertId = result.insertId || result[0]?.insertId;
      const [rows] = await pool.query('SELECT * FROM fraud_rules WHERE id = ?', [insertId]);
      const rule = Array.isArray(rows) ? rows[0] : rows;

      return reply.code(201).send({
        success: true,
        data: {
          id: rule.id,
          rule_type: rule.rule_type,
          publisher_id: rule.publisher_id,
          offer_id: rule.offer_id,
          rule_name: rule.rule_name,
          rule_config: typeof rule.rule_config === 'string' ? JSON.parse(rule.rule_config) : rule.rule_config,
          action: rule.action,
          is_active: Boolean(rule.is_active),
          created_at: rule.created_at,
          updated_at: rule.updated_at,
        },
      });
    } catch (error) {
      logger.error('FraudController.createFraudRule error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  /**
   * Update fraud rule
   * PATCH /api/admin/fraud/rules/:id
   */
  async updateFraudRule(request, reply) {
    try {
      const ruleId = parseInt(request.params.id);
      const updates = request.body;

      const updateFields = [];
      const params = [];

      if (updates.rule_name !== undefined) {
        updateFields.push('rule_name = ?');
        params.push(updates.rule_name);
      }

      if (updates.rule_config !== undefined) {
        updateFields.push('rule_config = ?');
        params.push(JSON.stringify(updates.rule_config));
      }

      if (updates.action !== undefined) {
        updateFields.push('action = ?');
        params.push(updates.action);
      }

      if (updates.is_active !== undefined) {
        updateFields.push('is_active = ?');
        params.push(updates.is_active ? 1 : 0);
      }

      if (updateFields.length === 0) {
        return reply.code(400).send(createErrorResponse(new Error('No fields to update'), 400));
      }

      updateFields.push('updated_at = NOW()');
      params.push(ruleId);

      await pool.query(
        `UPDATE fraud_rules SET ${updateFields.join(', ')} WHERE id = ?`,
        params
      );

      const [rows] = await pool.query('SELECT * FROM fraud_rules WHERE id = ?', [ruleId]);
      const rule = Array.isArray(rows) ? rows[0] : rows;

      if (!rule) {
        return reply.code(404).send(createErrorResponse(new Error('Fraud rule not found'), 404));
      }

      return reply.send({
        success: true,
        data: {
          id: rule.id,
          rule_type: rule.rule_type,
          publisher_id: rule.publisher_id,
          offer_id: rule.offer_id,
          rule_name: rule.rule_name,
          rule_config: typeof rule.rule_config === 'string' ? JSON.parse(rule.rule_config) : rule.rule_config,
          action: rule.action,
          is_active: Boolean(rule.is_active),
          created_at: rule.created_at,
          updated_at: rule.updated_at,
        },
      });
    } catch (error) {
      logger.error('FraudController.updateFraudRule error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  /**
   * Manage IP access lists (blacklist/whitelist)
   * GET /api/admin/fraud/ip-access-lists
   */
  async getIPAccessLists(request, reply) {
    try {
      const listType = request.query.list_type || null;
      const scope = request.query.scope || null;
      const offerId = request.query.offer_id ? parseInt(request.query.offer_id) : null;
      const publisherId = request.query.publisher_id ? parseInt(request.query.publisher_id) : null;

      let query = `SELECT * FROM ip_access_lists WHERE 1=1`;
      const params = [];

      if (listType) {
        query += ` AND list_type = ?`;
        params.push(listType);
      }

      if (scope) {
        query += ` AND scope = ?`;
        params.push(scope);
      }

      if (offerId) {
        query += ` AND offer_id = ?`;
        params.push(offerId);
      }

      if (publisherId) {
        query += ` AND publisher_id = ?`;
        params.push(publisherId);
      }

      query += ` ORDER BY created_at DESC LIMIT ? OFFSET ?`;
      params.push(request.query.limit ? parseInt(request.query.limit) : 100, request.query.offset ? parseInt(request.query.offset) : 0);

      const [rows] = await pool.query(query, params);
      const lists = Array.isArray(rows) ? rows : [];

      return reply.send({
        success: true,
        data: lists,
        count: lists.length,
      });
    } catch (error) {
      logger.error('FraudController.getIPAccessLists error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  /**
   * Add IP to access list
   * POST /api/admin/fraud/ip-access-lists
   */
  async addIPToAccessList(request, reply) {
    try {
      const { ip_address, list_type, scope, offer_id, publisher_id, reason } = request.body;

      if (!ip_address || !list_type || !scope) {
        return reply.code(400).send(createErrorResponse(
          new Error('ip_address, list_type, and scope are required'),
          400
        ));
      }

      const [result] = await pool.query(
        `INSERT INTO ip_access_lists (ip_address, list_type, scope, offer_id, publisher_id, reason, is_active)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [ip_address, list_type, scope, offer_id || null, publisher_id || null, reason || null]
      );

      const insertId = result.insertId || result[0]?.insertId;
      const [rows] = await pool.query('SELECT * FROM ip_access_lists WHERE id = ?', [insertId]);
      const entry = Array.isArray(rows) ? rows[0] : rows;

      return reply.code(201).send({
        success: true,
        data: entry,
      });
    } catch (error) {
      logger.error('FraudController.addIPToAccessList error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  /**
   * Get user-agent blacklist
   * GET /api/admin/fraud/user-agent-blacklist
   */
  async getUserAgentBlacklist(request, reply) {
    try {
      const [rows] = await pool.query(
        `SELECT * FROM user_agent_blacklist 
         WHERE is_active = 1 
         ORDER BY created_at DESC`,
        []
      );
      const blacklist = Array.isArray(rows) ? rows : [];

      return reply.send({
        success: true,
        data: blacklist,
        count: blacklist.length,
      });
    } catch (error) {
      logger.error('FraudController.getUserAgentBlacklist error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  /**
   * Add user-agent to blacklist
   * POST /api/admin/fraud/user-agent-blacklist
   */
  async addUserAgentToBlacklist(request, reply) {
    try {
      const { pattern, match_type, reason } = request.body;

      if (!pattern || !match_type) {
        return reply.code(400).send(createErrorResponse(
          new Error('pattern and match_type are required'),
          400
        ));
      }

      const [result] = await pool.query(
        `INSERT INTO user_agent_blacklist (pattern, match_type, reason, is_active)
         VALUES (?, ?, ?, 1)`,
        [pattern, match_type, reason || null]
      );

      const insertId = result.insertId || result[0]?.insertId;
      const [rows] = await pool.query('SELECT * FROM user_agent_blacklist WHERE id = ?', [insertId]);
      const entry = Array.isArray(rows) ? rows[0] : rows;

      return reply.code(201).send({
        success: true,
        data: entry,
      });
    } catch (error) {
      logger.error('FraudController.addUserAgentToBlacklist error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }
}

export default new FraudController();
