import adminController from '../controllers/adminController.js';
import { authenticateAdmin } from '../middleware/auth.js';

async function adminRoutes(fastify) {
  // Apply auth middleware to all admin routes
  fastify.addHook('onRequest', authenticateAdmin);

  // Publisher routes
  fastify.post('/publishers', adminController.createPublisher);
  fastify.patch('/publishers/:id', adminController.updatePublisher);
  fastify.delete('/publishers/:id', adminController.deletePublisher);

  fastify.get('/publishers', adminController.listPublishers);
  fastify.get('/publishers/:id', adminController.getPublisher);

  // Assignment routes
  fastify.post('/assignments', adminController.createAssignment);
  fastify.patch('/assignments/:id', adminController.updateAssignment);
  fastify.get('/assignments', adminController.listAssignments);
  fastify.get('/assignments/:id', adminController.getAssignment);
  fastify.get('/assignments/:id/tracking-url', adminController.getTrackingURL);
  fastify.delete('/assignments/:id', adminController.deleteAssignment);

  // Test conversion
  fastify.post('/test-conversion', adminController.testConversion);

  // Test Affiliate Postback (Debug Tool)
  fastify.post('/test-affiliate-postback', adminController.testAffiliatePostback);
  fastify.get('/affiliate-postback-logs', adminController.getAffiliatePostbackLogs);
}

export default adminRoutes;

