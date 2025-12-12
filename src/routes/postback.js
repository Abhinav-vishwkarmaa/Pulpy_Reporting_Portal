import postbackController from '../controllers/postbackController.js';

async function postbackRoutes(fastify, options) {
  // Postback endpoint - supports both GET and POST
  fastify.get('/postback', postbackController.handlePostback);
  
  fastify.post('/postback', postbackController.handlePostback);
}

export default postbackRoutes;

