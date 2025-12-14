import postbackRetryService from '../services/postbackRetryService.js';
import logger from '../utils/logger.js';
import { createErrorResponse } from '../utils/errorResponse.js';

export class PostbackRetryController {
  async getFailedPostbacks(request, reply) {
    try {
      const filters = {
        publisher_id: request.query.publisher_id ? parseInt(request.query.publisher_id) : null,
        status: request.query.status || null,
        limit: request.query.limit ? parseInt(request.query.limit) : 100,
        offset: request.query.offset ? parseInt(request.query.offset) : 0,
      };
      const postbacks = await postbackRetryService.getFailedPostbacks(filters);
      return reply.send({ success: true, data: postbacks, count: postbacks.length });
    } catch (error) {
      logger.error('PostbackRetryController.getFailedPostbacks error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async retryPostback(request, reply) {
    try {
      const queueId = parseInt(request.params.queueId);
      const result = await postbackRetryService.processRetry(queueId);
      return reply.send({ success: true, data: result });
    } catch (error) {
      logger.error('PostbackRetryController.retryPostback error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }
}

export default new PostbackRetryController();
