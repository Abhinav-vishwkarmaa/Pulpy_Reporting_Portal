import postbackController from '../controllers/postbackController.js';

async function postbackRoutes(fastify, options) {
  // Postback endpoint - supports both GET and POST
  fastify.get('/postback',{config:{rateLimit:false}}, postbackController.handlePostback);
  
  fastify.post('/postback', {config:{rateLimit:false}}, postbackController.handlePostback);
}

export default postbackRoutes;

