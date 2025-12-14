import fraudController from '../controllers/fraudController.js';
import { authenticateAdmin } from '../middleware/auth.js';

async function fraudRoutes(fastify, options) {
  // All fraud routes require admin authentication
  fastify.addHook('onRequest', authenticateAdmin);

  // Fraud logs
  fastify.get('/logs', fraudController.getFraudLogs);

  // Publisher fraud scores
  fastify.get('/publisher-scores', fraudController.getPublisherFraudScores);
  fastify.post('/calculate-score/:publisherId', fraudController.calculatePublisherScore);

  // Fraud rules
  fastify.get('/rules', fraudController.getFraudRules);
  fastify.post('/rules', fraudController.createFraudRule);
  fastify.patch('/rules/:id', fraudController.updateFraudRule);

  // IP access lists (blacklist/whitelist)
  fastify.get('/ip-access-lists', fraudController.getIPAccessLists);
  fastify.post('/ip-access-lists', fraudController.addIPToAccessList);

  // User-agent blacklist
  fastify.get('/user-agent-blacklist', fraudController.getUserAgentBlacklist);
  fastify.post('/user-agent-blacklist', fraudController.addUserAgentToBlacklist);
}

export default fraudRoutes;
