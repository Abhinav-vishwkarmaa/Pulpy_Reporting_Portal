import adminLoggingController from '../controllers/adminLoggingController.js';
import { authenticateAdmin } from '../middleware/auth.js';

async function adminLoggingRoutes(fastify, options) {
  fastify.addHook('onRequest', authenticateAdmin);

  fastify.get('/change-logs', adminLoggingController.getChangeLogs);
  fastify.get('/tracking-logs', adminLoggingController.getTrackingLogs);
  fastify.get('/postback-logs', adminLoggingController.getPostbackLogs);
  fastify.get('/admin-action-logs', adminLoggingController.getAdminActionLogs);
  fastify.post('/force-actions', adminLoggingController.createForceAction);
}

export default adminLoggingRoutes;
