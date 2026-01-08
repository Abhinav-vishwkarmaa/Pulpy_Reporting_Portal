import trackingController from '../controllers/trackingController.js';

async function trackingRoutes(fastify, options) {
  // Click tracking
  // Click tracking - handle both GET and HEAD
  fastify.route({
    method: ['GET', 'HEAD'],
    url: '/click',
    handler: async (request, reply) => {
      if (request.method === 'HEAD') {
        return reply.code(200).send();
      }
      return trackingController.handleClick(request, reply);
    }
  });

  // Impression tracking
  fastify.get('/imp', trackingController.handleImpression);
}

export default trackingRoutes;

