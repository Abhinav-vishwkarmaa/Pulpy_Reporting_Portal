import offerService from '../services/offer.service.js';
import logger from '../utils/logger.js';

const buildSuccess = (data, message) => ({
  success: true,
  message,
  data,
});

const buildError = (message, status = 500, error = 'Internal Server Error') => ({
  success: false,
  error,
  message,
});

class OfferController {
  async createOffer(request, reply) {
    try {
      const offer = await offerService.createOffer(request.body);
      return reply.code(201).send(buildSuccess(offer, 'Offer created successfully'));
    } catch (error) {
      logger.error('OfferController.createOffer error:', error);
      const status = error.statusCode || 500;
      return reply.code(status).send(buildError(error.message || 'Failed to create offer', status));
    }
  }

  async updateOffer(request, reply) {
    try {
      const offer = await offerService.updateOffer(request.params.id, request.body);
      if (!offer) {
        return reply.code(404).send(buildError('Offer not found', 404, 'Not Found'));
      }
      return reply.send(buildSuccess(offer, 'Offer updated successfully'));
    } catch (error) {
      logger.error('OfferController.updateOffer error:', error);
      const status = error.statusCode || 500;
      return reply.code(status).send(buildError(error.message || 'Failed to update offer', status));
    }
  }

  async changeStatus(request, reply) {
    try {
      const offer = await offerService.changeStatus(request.params.id, request.body.status);
      if (!offer) {
        return reply.code(404).send(buildError('Offer not found', 404, 'Not Found'));
      }
      return reply.send(buildSuccess(offer, 'Offer status updated'));
    } catch (error) {
      logger.error('OfferController.changeStatus error:', error);
      return reply.code(500).send(buildError('Failed to change offer status'));
    }
  }

  async getOffer(request, reply) {
    try {
      const { timezone } = request.query;
      const offer = await offerService.getOfferByIdWithDetails(request.params.id, timezone);
      if (!offer) {
        return reply.code(404).send(buildError('Offer not found', 404, 'Not Found'));
      }
      return reply.send(buildSuccess(offer));
    } catch (error) {
      logger.error('OfferController.getOffer error:', error);
      return reply.code(500).send(buildError('Failed to fetch offer'));
    }
  }

  async listOffers(request, reply) {
    try {
      const result = await offerService.listOffers(request.query);
      return reply.send({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      logger.error('OfferController.listOffers error:', error);
      return reply.code(500).send(buildError('Failed to list offers'));
    }
  }

  async deleteOffer(request, reply) {
    try {
      const result = await offerService.deleteOffer(request.params.id);
      if (!result) {
        return reply.code(404).send(buildError('Offer not found', 404, 'Not Found'));
      }
      return reply.send(buildSuccess(result, 'Offer deleted'));
    } catch (error) {
      logger.error('OfferController.deleteOffer error:', error);
      return reply.code(500).send(buildError('Failed to delete offer'));
    }
  }

  async updateAssignment(request, reply) {
    try {
      const assignment = await offerService.updateAssignment(request.params.assignmentId, request.body);
      if (!assignment) {
        return reply.code(404).send(buildError('Assignment not found', 404, 'Not Found'));
      }
      return reply.send(buildSuccess(assignment, 'Assignment updated successfully'));
    } catch (error) {
      logger.error('OfferController.updateAssignment error:', error);
      const status = error.statusCode || 500;
      return reply.code(status).send(buildError(error.message || 'Failed to update assignment', status));
    }
  }
  async getofferDetail(request, reply) {
    try {
      const assignment = await offerService.geteditOffer(request.params.id)
      return reply.send(buildSuccess(assignment))
    } catch (error) {
      logger.error('OfferController.getofferDetail error:', error);
      return reply.code(500).send(buildError('Failed to get offer detail'));
    }
  }

  async getStats(request, reply) {
    try {
      const stats = await offerService.getOfferStats(request.params.id);
      return reply.send(buildSuccess(stats));
    } catch (error) {
      logger.error('OfferController.getStats error:', error);
      return reply.code(500).send(buildError('Failed to fetch offer stats'));
    }
  }

  async getDailyStats(request, reply) {
    try {
      const { timezone } = request.query;
      const stats = await offerService.getOfferDailyStats(request.params.id, timezone);
      return reply.send(buildSuccess(stats));
    } catch (error) {
      logger.error('OfferController.getDailyStats error:', error);
      return reply.code(500).send(buildError('Failed to fetch daily stats'));
    }
  }

  async getAssignments(request, reply) {
    try {
      const assignments = await offerService.getOfferAssignments(request.params.id);
      return reply.send(buildSuccess(assignments));
    } catch (error) {
      logger.error('OfferController.getAssignments error:', error);
      return reply.code(500).send(buildError('Failed to fetch assignments'));
    }
  }

  async getRecentClicks(request, reply) {
    try {
      const clicks = await offerService.getOfferRecentClicks(request.params.id);
      return reply.send(buildSuccess(clicks));
    } catch (error) {
      logger.error('OfferController.getRecentClicks error:', error);
      return reply.code(500).send(buildError('Failed to fetch recent clicks'));
    }
  }

  async getRecentConversions(request, reply) {
    try {
      const conversions = await offerService.getOfferRecentConversions(request.params.id);
      return reply.send(buildSuccess(conversions));
    } catch (error) {
      logger.error('OfferController.getRecentConversions error:', error);
      return reply.code(500).send(buildError('Failed to fetch recent conversions'));
    }
  }

  async getPublisherStats(request, reply) {
    try {
      const stats = await offerService.getOfferPublisherStats(request.params.id);
      return reply.send(buildSuccess(stats));
    } catch (error) {
      logger.error('OfferController.getPublisherStats error:', error);
      return reply.code(500).send(buildError('Failed to fetch publisher stats'));
    }
  }
}

export default new OfferController();
