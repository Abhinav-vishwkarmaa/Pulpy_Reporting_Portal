import publisherPaymentController from '../controllers/publisherPaymentController.js';
import { authenticateAdmin } from '../middleware/auth.js';

async function publisherPaymentRoutes(fastify, options) {
  fastify.addHook('onRequest', authenticateAdmin);

  // Publisher balance
  fastify.get('/publisher/:publisherId/balance', publisherPaymentController.getPublisherBalance);
  fastify.get('/publisher/:publisherId/earnings', publisherPaymentController.getPublisherEarnings);

  // Earnings calculation
  fastify.post('/calculate-earnings', publisherPaymentController.calculateEarnings);

  // Invoices
  fastify.get('/invoices', publisherPaymentController.getInvoices);
  fastify.post('/invoices', publisherPaymentController.createInvoice);

  // Payments
  fastify.post('/', publisherPaymentController.createPayment);
  fastify.patch('/:paymentId/complete', publisherPaymentController.completePayment);

  // Payment methods
  fastify.get('/payment-methods', publisherPaymentController.getPaymentMethods);
  fastify.post('/payment-methods', publisherPaymentController.addPaymentMethod);
}

export default publisherPaymentRoutes;
