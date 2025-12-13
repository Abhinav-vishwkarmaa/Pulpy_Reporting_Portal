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
      const offer = await offerService.getOfferByIdWithDetails(request.params.id);
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
}

export default new OfferController();
