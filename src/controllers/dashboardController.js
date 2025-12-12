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
}

export default new DashboardController();

