import advertiserService from '../services/advertiser.service.js';
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

class AdvertiserController {
  async createAdvertiser(request, reply) {
    try {
      const advertiser = await advertiserService.createAdvertiser(request.body);
      return reply.code(201).send(buildSuccess(advertiser, 'Advertiser created successfully'));
    } catch (error) {
      logger.error('AdvertiserController.createAdvertiser error:', error);
      if (error.code === 'ER_DUP_ENTRY') {
        return reply.code(409).send(
          buildError('Email already exists for another advertiser', 409, 'Conflict')
        );
      }
      return reply.code(500).send(buildError('Failed to create advertiser'));
    }
  }

  async updateAdvertiser(request, reply) {
    try {
      const advertiser = await advertiserService.updateAdvertiser(request.params.id, request.body);
      if (!advertiser) {
        return reply.code(404).send(buildError('Advertiser not found', 404, 'Not Found'));
      }
      return reply.send(buildSuccess(advertiser, 'Advertiser updated'));
    } catch (error) {
      logger.error('AdvertiserController.updateAdvertiser error:', error);
      return reply.code(500).send(buildError('Failed to update advertiser'));
    }
  }

  async getAdvertiser(request, reply) {
    try {
      const advertiser = await advertiserService.getAdvertiserById(request.params.id);
      if (!advertiser) {
        return reply.code(404).send(buildError('Advertiser not found', 404, 'Not Found'));
      }
      return reply.send(buildSuccess(advertiser));
    } catch (error) {
      logger.error('AdvertiserController.getAdvertiser error:', error);
      return reply.code(500).send(buildError('Failed to fetch advertiser'));
    }
  }

  async listAdvertisers(request, reply) {
    try {
      const result = await advertiserService.listAdvertisers(request.query);
      return reply.send({
        success: true,
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      logger.error('AdvertiserController.listAdvertisers error:', error);
      return reply.code(500).send(buildError('Failed to list advertisers'));
    }
  }

  async deleteAdvertiser(request, reply) {
    try {
      const advertiser = await advertiserService.deleteAdvertiser(request.params.id);
      if (!advertiser) {
        return reply.code(404).send(buildError('Advertiser not found', 404, 'Not Found'));
      }
      return reply.send(buildSuccess(advertiser, 'Advertiser deactivated'));
    } catch (error) {
      logger.error('AdvertiserController.deleteAdvertiser error:', error);
      return reply.code(500).send(buildError('Failed to deactivate advertiser'));
    }
  }
}

export default new AdvertiserController();
