import advertiserBillingService from '../services/advertiserBillingService.js';
import logger from '../utils/logger.js';
import { createErrorResponse } from '../utils/errorResponse.js';
import pool from '../db/connection.js';

export class AdvertiserBillingController {
  async getAdvertiserBalance(request, reply) {
    try {
      const advertiserId = parseInt(request.params.advertiserId);
      const balance = await advertiserBillingService.getAdvertiserBalance(advertiserId);
      return reply.send({ success: true, data: balance });
    } catch (error) {
      logger.error('AdvertiserBillingController.getAdvertiserBalance error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async calculateRevenue(request, reply) {
    try {
      const { advertiser_id, period_start, period_end } = request.body;
      const revenue = await advertiserBillingService.createOrUpdateRevenue(advertiser_id, period_start, period_end);
      await advertiserBillingService.updateAdvertiserBalance(advertiser_id);
      return reply.send({ success: true, data: revenue });
    } catch (error) {
      logger.error('AdvertiserBillingController.calculateRevenue error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async createInvoice(request, reply) {
    try {
      const { revenue_id } = request.body;
      const invoice = await advertiserBillingService.createInvoice(revenue_id);
      await advertiserBillingService.updateAdvertiserBalance(invoice.advertiser_id);
      return reply.code(201).send({ success: true, data: invoice });
    } catch (error) {
      logger.error('AdvertiserBillingController.createInvoice error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async getInvoices(request, reply) {
    try {
      let query = `SELECT i.*, a.name as advertiser_name, a.email as advertiser_email
                   FROM advertiser_invoices i
                   JOIN advertisers a ON i.advertiser_id = a.id
                   WHERE 1=1`;
      const params = [];

      if (request.query.advertiser_id) {
        query += ` AND i.advertiser_id = ?`;
        params.push(parseInt(request.query.advertiser_id));
      }

      if (request.query.status) {
        query += ` AND i.status = ?`;
        params.push(request.query.status);
      }

      query += ` ORDER BY i.created_at DESC LIMIT ? OFFSET ?`;
      params.push(request.query.limit ? parseInt(request.query.limit) : 50, request.query.offset ? parseInt(request.query.offset) : 0);

      const [rows] = await pool.query(query, params);
      return reply.send({ success: true, data: Array.isArray(rows) ? rows : [], count: (Array.isArray(rows) ? rows : []).length });
    } catch (error) {
      logger.error('AdvertiserBillingController.getInvoices error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }
}

export default new AdvertiserBillingController();
