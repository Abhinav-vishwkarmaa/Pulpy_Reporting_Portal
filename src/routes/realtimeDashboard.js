import realtimeDashboardController from '../controllers/realtimeDashboardController.js';
import { authenticateAdmin } from '../middleware/auth.js';

async function realtimeDashboardRoutes(fastify, options) {
  fastify.addHook('onRequest', authenticateAdmin);

  fastify.get('/stats', realtimeDashboardController.getRealtimeStats);
  fastify.get('/top-offers', realtimeDashboardController.getTopOffers);
  fastify.get('/top-publishers', realtimeDashboardController.getTopPublishers);
}

export default realtimeDashboardRoutes;
