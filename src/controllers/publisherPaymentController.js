import publisherPaymentService from '../services/publisherPaymentService.js';
import logger from '../utils/logger.js';
import { createErrorResponse } from '../utils/errorResponse.js';
import pool from '../db/connection.js';

export class PublisherPaymentController {
  /**
   * Get publisher balance
   * GET /api/admin/payments/publisher/:publisherId/balance
   */
  async getPublisherBalance(request, reply) {
    try {
      const publisherId = parseInt(request.params.publisherId);
      const balance = await publisherPaymentService.getPublisherBalance(publisherId);
      return reply.send({ success: true, data: balance });
    } catch (error) {
      logger.error('PublisherPaymentController.getPublisherBalance error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  /**
   * Get publisher earnings
   * GET /api/admin/payments/publisher/:publisherId/earnings
   */
  async getPublisherEarnings(request, reply) {
    try {
      const publisherId = parseInt(request.params.publisherId);
      const filters = {
        status: request.query.status || null,
        start_date: request.query.start_date || null,
        end_date: request.query.end_date || null,
        limit: request.query.limit ? parseInt(request.query.limit) : 50,
        offset: request.query.offset ? parseInt(request.query.offset) : 0,
      };
      const earnings = await publisherPaymentService.getEarnings(publisherId, filters);
      return reply.send({ success: true, data: earnings, count: earnings.length });
    } catch (error) {
      logger.error('PublisherPaymentController.getPublisherEarnings error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  /**
   * Calculate earnings for period
   * POST /api/admin/payments/calculate-earnings
   */
  async calculateEarnings(request, reply) {
    try {
      const { publisher_id, period_start, period_end } = request.body;
      const earnings = await publisherPaymentService.createOrUpdateEarnings(
        publisher_id,
        period_start,
        period_end
      );
      await publisherPaymentService.updatePublisherBalance(publisher_id);
      return reply.send({ success: true, data: earnings });
    } catch (error) {
      logger.error('PublisherPaymentController.calculateEarnings error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  /**
   * Create invoice
   * POST /api/admin/payments/invoices
   */
  async createInvoice(request, reply) {
    try {
      const { earnings_id } = request.body;
      const adminUserId = request.user?.id || null;
      const invoice = await publisherPaymentService.createInvoice(earnings_id, adminUserId);
      return reply.code(201).send({ success: true, data: invoice });
    } catch (error) {
      logger.error('PublisherPaymentController.createInvoice error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  /**
   * Get invoices
   * GET /api/admin/payments/invoices
   */
  async getInvoices(request, reply) {
    try {
      let query = `SELECT i.*, p.email as publisher_email, p.company_name as publisher_company
                   FROM publisher_invoices i
                   JOIN publishers p ON i.publisher_id = p.id
                   WHERE 1=1`;
      const params = [];

      if (request.query.publisher_id) {
        query += ` AND i.publisher_id = ?`;
        params.push(parseInt(request.query.publisher_id));
      }

      if (request.query.status) {
        query += ` AND i.status = ?`;
        params.push(request.query.status);
      }

      query += ` ORDER BY i.created_at DESC LIMIT ? OFFSET ?`;
      params.push(request.query.limit ? parseInt(request.query.limit) : 50, request.query.offset ? parseInt(request.query.offset) : 0);

      const [rows] = await pool.query(query, params);
      const invoices = Array.isArray(rows) ? rows : [];

      return reply.send({ success: true, data: invoices, count: invoices.length });
    } catch (error) {
      logger.error('PublisherPaymentController.getInvoices error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  /**
   * Create payment
   * POST /api/admin/payments
   */
  async createPayment(request, reply) {
    try {
      const { invoice_id, payment_method_id } = request.body;
      const adminUserId = request.user?.id || null;
      const payment = await publisherPaymentService.createPayment(invoice_id, payment_method_id, adminUserId);
      return reply.code(201).send({ success: true, data: payment });
    } catch (error) {
      logger.error('PublisherPaymentController.createPayment error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  /**
   * Complete payment
   * PATCH /api/admin/payments/:paymentId/complete
   */
  async completePayment(request, reply) {
    try {
      const paymentId = parseInt(request.params.paymentId);
      const { transaction_id } = request.body;
      const payment = await publisherPaymentService.completePayment(paymentId, transaction_id);
      return reply.send({ success: true, data: payment });
    } catch (error) {
      logger.error('PublisherPaymentController.completePayment error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  /**
   * Get payment methods
   * GET /api/admin/payments/payment-methods
   */
  async getPaymentMethods(request, reply) {
    try {
      const publisherId = request.query.publisher_id ? parseInt(request.query.publisher_id) : null;
      let query = `SELECT * FROM payment_methods WHERE 1=1`;
      const params = [];

      if (publisherId) {
        query += ` AND publisher_id = ?`;
        params.push(publisherId);
      }

      query += ` ORDER BY is_default DESC, created_at DESC`;

      const [rows] = await pool.query(query, params);
      const methods = Array.isArray(rows) ? rows : [];

      return reply.send({ success: true, data: methods, count: methods.length });
    } catch (error) {
      logger.error('PublisherPaymentController.getPaymentMethods error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  /**
   * Add payment method
   * POST /api/admin/payments/payment-methods
   */
  async addPaymentMethod(request, reply) {
    try {
      const data = request.body;
      const [result] = await pool.query(
        `INSERT INTO payment_methods (
          publisher_id, method_type, account_name, account_number, routing_number,
          bank_name, bank_address, paypal_email, crypto_address, crypto_type,
          swift_code, iban, is_default, is_active
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          data.publisher_id,
          data.method_type,
          data.account_name || null,
          data.account_number || null,
          data.routing_number || null,
          data.bank_name || null,
          data.bank_address || null,
          data.paypal_email || null,
          data.crypto_address || null,
          data.crypto_type || null,
          data.swift_code || null,
          data.iban || null,
          data.is_default ? 1 : 0,
          data.is_active !== undefined ? (data.is_active ? 1 : 0) : 1,
        ]
      );

      const insertId = result.insertId || result[0]?.insertId;
      const [rows] = await pool.query('SELECT * FROM payment_methods WHERE id = ?', [insertId]);
      const method = Array.isArray(rows) ? rows[0] : rows;

      return reply.code(201).send({ success: true, data: method });
    } catch (error) {
      logger.error('PublisherPaymentController.addPaymentMethod error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }
}

export default new PublisherPaymentController();
