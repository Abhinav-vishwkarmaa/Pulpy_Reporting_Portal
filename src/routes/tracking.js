import trackingController from '../controllers/trackingController.js';

async function trackingRoutes(fastify, options) {
  // Click tracking
  fastify.get('/click', trackingController.handleClick);
  
  // Impression tracking
  fastify.get('/imp', trackingController.handleImpression);
}

export default trackingRoutes;

