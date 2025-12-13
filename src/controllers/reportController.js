import reportService from '../services/reportService.js';
import logger from '../utils/logger.js';
import { createErrorResponse } from '../utils/errorResponse.js';

export class ReportController {
  async getSummary(request, reply) {
    try {
      const filters = {};
      
      if (request.query.date_from) filters.date_from = request.query.date_from;
      if (request.query.date_to) filters.date_to = request.query.date_to;
      if (request.query.offer_id) filters.offer_id = parseInt(request.query.offer_id);
      if (request.query.publisher_id) filters.publisher_id = parseInt(request.query.publisher_id);
      if (request.query.country) filters.country = request.query.country;
      if (request.query.ip) filters.ip = request.query.ip;
      if (request.query.tid) filters.tid = request.query.tid;
      if (request.query.rcid) filters.rcid = request.query.rcid;
      if (request.query.device_brand) filters.device_brand = request.query.device_brand;
      if (request.query.os) filters.os = request.query.os;
      if (request.query.browser) filters.browser = request.query.browser;
      if (request.query.referrer) filters.referrer = request.query.referrer;
      if (request.query.source_id) filters.source_id = request.query.source_id;
      if (request.query.google_id) filters.google_id = request.query.google_id;
      if (request.query.android_id) filters.android_id = request.query.android_id;
      if (request.query.hour !== undefined) filters.hour = parseInt(request.query.hour);
      
      const summary = await reportService.getSummary(filters);
      
      return reply.send({
        success: true,
        data: summary,
      });
    } catch (error) {
      logger.error('ReportController.getSummary error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }
  
  async getDetailed(request, reply) {
    try {
      const filters = {};
      
      if (request.query.date_from) filters.date_from = request.query.date_from;
      if (request.query.date_to) filters.date_to = request.query.date_to;
      if (request.query.offer_id) filters.offer_id = parseInt(request.query.offer_id);
      if (request.query.publisher_id) filters.publisher_id = parseInt(request.query.publisher_id);
      if (request.query.country) filters.country = request.query.country;
      if (request.query.ip) filters.ip = request.query.ip;
      if (request.query.tid) filters.tid = request.query.tid;
      if (request.query.rcid) filters.rcid = request.query.rcid;
      if (request.query.device_brand) filters.device_brand = request.query.device_brand;
      if (request.query.os) filters.os = request.query.os;
      if (request.query.browser) filters.browser = request.query.browser;
      if (request.query.referrer) filters.referrer = request.query.referrer;
      if (request.query.source_id) filters.source_id = request.query.source_id;
      if (request.query.google_id) filters.google_id = request.query.google_id;
      if (request.query.android_id) filters.android_id = request.query.android_id;
      if (request.query.hour !== undefined) filters.hour = parseInt(request.query.hour);
      if (request.query.page) filters.page = parseInt(request.query.page);
      if (request.query.limit) filters.limit = parseInt(request.query.limit);
      
      const result = await reportService.getDetailed(filters);
      
      return reply.send({
        success: true,
        ...result,
      });
    } catch (error) {
      logger.error('ReportController.getDetailed error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async getPublisherConversionStats(request, reply) {
    try {
      const filters = {};
      
      if (request.query.publisher_id) filters.publisher_id = parseInt(request.query.publisher_id);
      if (request.query.offer_id) filters.offer_id = parseInt(request.query.offer_id);
      if (request.query.date_from) filters.date_from = request.query.date_from;
      if (request.query.date_to) filters.date_to = request.query.date_to;
      
      const result = await reportService.getPublisherConversionStats(filters);
      
      return reply.send({
        success: true,
        data: result,
      });
    } catch (error) {
      logger.error('ReportController.getPublisherConversionStats error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }
}

export default new ReportController();

