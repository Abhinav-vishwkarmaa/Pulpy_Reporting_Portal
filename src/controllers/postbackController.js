import postbackService from '../services/postbackService.js';
import logger from '../utils/logger.js';
import { createErrorResponse } from '../utils/errorResponse.js';

export class PostbackController {
  async handlePostback(request, reply) {
    try {
      // Support both GET and POST
      const params = request.method === 'GET' ? request.query : request.body;

      const result = await postbackService.processPostback(params, request);

      // Transform conversion data: rename click_uuid to click_id for API response
      let conversionData = result.conversion || null;
      if (conversionData && conversionData.click_uuid) {
        conversionData = {
          ...conversionData,
          click_id: conversionData.click_uuid,
        };
        // Remove click_uuid from response (keep only click_id)
        delete conversionData.click_uuid;
      }

      return reply.send({
        success: result.success,
        message: result.message,
        duplicate: result.duplicate || false,
        affiliate_postback: result.affiliate_postback || null,
        data: conversionData,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      if (error.code === 'RETRY_LATER') {
        const retrySeconds = 60;
        return reply
          .code(429)
          .header('Retry-After', retrySeconds)
          .send({
            success: false,
            error: 'Too Many Requests',
            message: error.message,
            retry_after: retrySeconds
          });
      }

      logger.error('PostbackController.handlePostback error:', error);
      return reply.code(400).send(createErrorResponse(error, 400));
    }
  }
}

export default new PostbackController();

