import postbackRetryController from '../controllers/postbackRetryController.js';
import { authenticateAdmin } from '../middleware/auth.js';

async function postbackRetryRoutes(fastify, options) {
  fastify.addHook('onRequest', authenticateAdmin);

  fastify.get('/failed', postbackRetryController.getFailedPostbacks);
  fastify.post('/retry/:queueId', postbackRetryController.retryPostback);
}

export default postbackRetryRoutes;
