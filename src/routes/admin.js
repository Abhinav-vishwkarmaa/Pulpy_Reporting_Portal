import adminController from '../controllers/adminController.js';
import { authenticateAdmin } from '../middleware/auth.js';

async function adminRoutes(fastify, options) {
  // Apply auth middleware to all admin routes
  fastify.addHook('onRequest', authenticateAdmin);
  
  // Publisher routes
  fastify.post('/publishers', adminController.createPublisher);
  fastify.patch('/publishers/:id', adminController.updatePublisher);
  fastify.delete('/publishers/:id', adminController.deletePublisher);
  
  fastify.get('/publishers', adminController.listPublishers);
  fastify.get('/publishers/:id', adminController.getPublisher);
  
  // Offer routes
  fastify.post('/offers', adminController.createOffer);
  fastify.patch('/offers/:id', adminController.updateOffer);
  fastify.delete('/offers/:id', adminController.deleteOffer);
  
  fastify.get('/offers/:type', adminController.listOffers);
  fastify.get('/offers/categories', adminController.getOfferCategories);
  fastify.get('/offers/single/:id', adminController.getOffer);
  fastify.patch('/offers/:id/status', adminController.updateOfferStatus);
  
  // Assignment routes
  fastify.post('/assignments', adminController.createAssignment);
  
  fastify.get('/assignments', adminController.listAssignments);
  fastify.get('/assignments/:id', adminController.getAssignment);
  fastify.get('/assignments/:id/tracking-url', adminController.getTrackingURL);
  fastify.delete('/assignments/:id', adminController.deleteAssignment);
  
  // Test conversion
  fastify.post('/test-conversion', adminController.testConversion);
}

export default adminRoutes;

