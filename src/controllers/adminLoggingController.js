import adminLoggingService from '../services/adminLoggingService.js';
import logger from '../utils/logger.js';
import { createErrorResponse } from '../utils/errorResponse.js';
import pool from '../db/connection.js';

export class AdminLoggingController {
  async getChangeLogs(request, reply) {
    try {
      const filters = {
        entity_type: request.query.entity_type || null,
        entity_id: request.query.entity_id ? parseInt(request.query.entity_id) : null,
        action: request.query.action || null,
        start_date: request.query.start_date || null,
        end_date: request.query.end_date || null,
        limit: request.query.limit ? parseInt(request.query.limit) : 100,
        offset: request.query.offset ? parseInt(request.query.offset) : 0,
      };
      const logs = await adminLoggingService.getChangeLogs(filters);
      return reply.send({ success: true, data: logs, count: logs.length });
    } catch (error) {
      logger.error('AdminLoggingController.getChangeLogs error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async getTrackingLogs(request, reply) {
    try {
      const filters = {
        event_type: request.query.event_type || null,
        offer_id: request.query.offer_id ? parseInt(request.query.offer_id) : null,
        publisher_id: request.query.publisher_id ? parseInt(request.query.publisher_id) : null,
        start_date: request.query.start_date || null,
        end_date: request.query.end_date || null,
        limit: request.query.limit ? parseInt(request.query.limit) : 100,
        offset: request.query.offset ? parseInt(request.query.offset) : 0,
      };
      const logs = await adminLoggingService.getTrackingLogs(filters);
      return reply.send({ success: true, data: logs, count: logs.length });
    } catch (error) {
      logger.error('AdminLoggingController.getTrackingLogs error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async getPostbackLogs(request, reply) {
    try {
      const filters = {
        conversion_id: request.query.conversion_id ? parseInt(request.query.conversion_id) : null,
        publisher_id: request.query.publisher_id ? parseInt(request.query.publisher_id) : null,
        success: request.query.success !== undefined ? request.query.success === 'true' : undefined,
        start_date: request.query.start_date || null,
        limit: request.query.limit ? parseInt(request.query.limit) : 100,
        offset: request.query.offset ? parseInt(request.query.offset) : 0,
      };
      const logs = await adminLoggingService.getPostbackLogs(filters);
      return reply.send({ success: true, data: logs, count: logs.length });
    } catch (error) {
      logger.error('AdminLoggingController.getPostbackLogs error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async getAdminActionLogs(request, reply) {
    try {
      const filters = {
        admin_user_id: request.query.admin_user_id ? parseInt(request.query.admin_user_id) : null,
        action_type: request.query.action_type || null,
        target_type: request.query.target_type || null,
        start_date: request.query.start_date || null,
        limit: request.query.limit ? parseInt(request.query.limit) : 100,
        offset: request.query.offset ? parseInt(request.query.offset) : 0,
      };
      const logs = await adminLoggingService.getAdminActionLogs(filters);
      return reply.send({ success: true, data: logs, count: logs.length });
    } catch (error) {
      logger.error('AdminLoggingController.getAdminActionLogs error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async createForceAction(request, reply) {
    try {
      const { action_type, target_type, target_id, action_data, reason, expires_at } = request.body;
      const adminUserId = request.user?.id;

      if (!action_type || !target_type || !target_id) {
        return reply.code(400).send(createErrorResponse(
          new Error('action_type, target_type, and target_id are required'),
          400
        ));
      }

      const forceAction = await adminLoggingService.createForceAction(
        adminUserId,
        action_type,
        target_type,
        target_id,
        action_data,
        reason,
        expires_at || null
      );

      // Log admin action
      await adminLoggingService.logAdminAction(
        adminUserId,
        action_type,
        target_type,
        target_id,
        { action_data, reason, expires_at },
        request.ip,
        request.headers['user-agent']
      );

      return reply.code(201).send({ success: true, data: forceAction });
    } catch (error) {
      logger.error('AdminLoggingController.createForceAction error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }
}

export default new AdminLoggingController();
