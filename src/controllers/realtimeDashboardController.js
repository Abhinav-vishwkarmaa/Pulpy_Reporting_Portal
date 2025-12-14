import realtimeDashboardService from '../services/realtimeDashboardService.js';
import logger from '../utils/logger.js';
import { createErrorResponse } from '../utils/errorResponse.js';

export class RealtimeDashboardController {
  async getRealtimeStats(request, reply) {
    try {
      const timeWindow = request.query.window || '5min';
      const filters = {
        offer_id: request.query.offer_id ? parseInt(request.query.offer_id) : null,
        publisher_id: request.query.publisher_id ? parseInt(request.query.publisher_id) : null,
      };
      const stats = await realtimeDashboardService.getRealtimeStats(timeWindow, filters);
      return reply.send({ success: true, data: stats });
    } catch (error) {
      logger.error('RealtimeDashboardController.getRealtimeStats error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async getTopOffers(request, reply) {
    try {
      const timeWindow = request.query.window || '15min';
      const limit = request.query.limit ? parseInt(request.query.limit) : 10;
      const offers = await realtimeDashboardService.getTopOffers(timeWindow, limit);
      return reply.send({ success: true, data: offers, count: offers.length });
    } catch (error) {
      logger.error('RealtimeDashboardController.getTopOffers error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async getTopPublishers(request, reply) {
    try {
      const timeWindow = request.query.window || '15min';
      const limit = request.query.limit ? parseInt(request.query.limit) : 10;
      const publishers = await realtimeDashboardService.getTopPublishers(timeWindow, limit);
      return reply.send({ success: true, data: publishers, count: publishers.length });
    } catch (error) {
      logger.error('RealtimeDashboardController.getTopPublishers error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }
}

export default new RealtimeDashboardController();
