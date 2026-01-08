import trackingService from '../services/trackingService.js';
import logger from '../utils/logger.js';
import { createErrorResponse } from '../utils/errorResponse.js';

export class TrackingController {
  async handleClick(request, reply) {
    try {
      // Diagnostic Log: Verify that only GET requests reach this point
      console.log(`[Diagnostic] handleClick called with Method: ${request.method} - URL: ${request.url}`);

      const result = await trackingService.trackClick(request.query, request);

      // If HTML error page is returned (offer invalid), return HTML instead of redirecting
      if (result.html) {
        return reply.type('text/html').code(200).send(result.html);
      }

      // Redirect to offer URL if valid
      return reply.redirect(302, result.redirect);
    } catch (error) {
      logger.error('TrackingController.handleClick error:', error);
      // Return error page or fallback
      return reply.code(400).send(createErrorResponse(error, 400));
    }
  }

  async handleImpression(request, reply) {
    try {
      const result = await trackingService.trackImpression(request.query, request);

      if (!result.success) {
        const error = new Error(result.error || 'Failed to track impression');
        return reply.code(400).send(createErrorResponse(error, 400));
      }

      // Return 1x1 pixel or success response
      return reply.code(200).type('image/gif').send(Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'));
    } catch (error) {
      logger.error('TrackingController.handleImpression error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }
}

export default new TrackingController();

