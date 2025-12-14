import advertiserBillingController from '../controllers/advertiserBillingController.js';
import { authenticateAdmin } from '../middleware/auth.js';

async function advertiserBillingRoutes(fastify, options) {
  fastify.addHook('onRequest', authenticateAdmin);

  fastify.get('/advertiser/:advertiserId/balance', advertiserBillingController.getAdvertiserBalance);
  fastify.post('/calculate-revenue', advertiserBillingController.calculateRevenue);
  fastify.post('/invoices', advertiserBillingController.createInvoice);
  fastify.get('/invoices', advertiserBillingController.getInvoices);
}

export default advertiserBillingRoutes;
