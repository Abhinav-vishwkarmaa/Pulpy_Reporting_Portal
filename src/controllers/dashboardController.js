import dashboardService from '../services/dashboardService.js';
import logger from '../utils/logger.js';
import { createErrorResponse } from '../utils/errorResponse.js';

export class DashboardController {
  async getDashboard(request, reply) {
    try {
      const stats = await dashboardService.getDashboardStats();
      return reply.send({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('DashboardController.getDashboard error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async getTopOffers(request, reply) {
    try {
      const filters = {
        limit: request.query.limit,
        date_from: request.query.date_from,
        date_to: request.query.date_to,
      };

      const data = await dashboardService.getTopOffers(filters);
      return reply.send({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('DashboardController.getTopOffers error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async getPerformanceChart(request, reply) {
    try {
      const filters = {
        date_from: request.query.date_from,
        date_to: request.query.date_to,
        group_by: request.query.group_by,
      };

      const data = await dashboardService.getPerformanceChart(filters);
      return reply.send({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('DashboardController.getPerformanceChart error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async getTopAffiliates(request, reply) {
    try {
      const filters = {
        limit: request.query.limit,
        date_from: request.query.date_from,
        date_to: request.query.date_to,
      };

      const result = await dashboardService.getTopAffiliates(filters);
      return reply.send({
        success: true,
        ...result,
      });
    } catch (error) {
      logger.error('DashboardController.getTopAffiliates error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async getInfoCards(request, reply) {
    try {
      const data = await dashboardService.getInfoCards();
      return reply.send({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('DashboardController.getInfoCards error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async getTopCountries(request, reply) {
    try {
      const filters = {
        limit: request.query.limit,
        date_from: request.query.date_from,
        date_to: request.query.date_to,
        metric: request.query.metric,
      };

      const data = await dashboardService.getTopCountries(filters);
      return reply.send({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('DashboardController.getTopCountries error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async getDashboardCards(request, reply) {
    try {
      const data = await dashboardService.getDashboardCards();
      return reply.send({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('DashboardController.getDashboardCards error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async getLiveOffers(request, reply) {
    try {
      const limit = request.query.limit || 5;
      const data = await dashboardService.getLiveOffers(limit);
      return reply.send({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('DashboardController.getLiveOffers error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async getRecentActivity(request, reply) {
    try {
      const limit = request.query.limit || 10;
      const data = await dashboardService.getRecentActivity(limit);
      return reply.send({
        success: true,
        data,
      });
    } catch (error) {
      logger.error('DashboardController.getRecentActivity error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }
}

export default new DashboardController();

