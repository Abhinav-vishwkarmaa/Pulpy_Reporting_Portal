import reportController from '../controllers/reportController.js';
import dashboardController from '../controllers/dashboardController.js';
import { authenticateAdmin } from '../middleware/auth.js';

async function reportRoutes(fastify, options) {
  // Apply auth middleware to all report routes
  fastify.addHook('onRequest', authenticateAdmin);
  
  // Dashboard
  fastify.get('/dashboard', dashboardController.getDashboard);
  
  // Reports
  fastify.get('/summary', reportController.getSummary);
  
  fastify.get('/detailed', reportController.getDetailed);
}

export default reportRoutes;

