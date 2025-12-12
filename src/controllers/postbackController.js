import postbackService from '../services/postbackService.js';
import logger from '../utils/logger.js';
import { createErrorResponse } from '../utils/errorResponse.js';

export class PostbackController {
  async handlePostback(request, reply) {
    try {
      // Support both GET and POST
      const params = request.method === 'GET' ? request.query : request.body;
      
      const result = await postbackService.processPostback(params, request);
      
      return reply.send({
        success: result.success,
        message: result.message,
        duplicate: result.duplicate || false,
        data: result.conversion || null,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error('PostbackController.handlePostback error:', error);
      return reply.code(400).send(createErrorResponse(error, 400));
    }
  }
}

export default new PostbackController();

