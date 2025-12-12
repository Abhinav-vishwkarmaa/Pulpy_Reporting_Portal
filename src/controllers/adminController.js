import publisherService from '../services/publisherService.js';
import offerService from '../services/offerService.js';
import assignmentService from '../services/assignmentService.js';
import trackingService from '../services/trackingService.js';
import logger from '../utils/logger.js';
import { createErrorResponse } from '../utils/errorResponse.js';
import { createOfferSchema, updateOfferStatusSchema } from '../validators/offerValidator.js';
import { updateOfferSchema } from '../validators/offerValidator.js';
import { updatePublisherSchema } from '../validators/publisherValidator.js';
import { createAssignmentSchema } from '../validators/assignmentValidator.js';
import { testConversionSchema } from '../validators/trackingValidator.js';

export class AdminController {
  // Publisher endpoints
  async createPublisher(request, reply) {
    try {
      const publisher = await publisherService.create(request.body);
      return reply.code(201).send({
        success: true,
        data: publisher,
      });
    } catch (error) {
      if (error.code === '23505') {
        return reply.code(409).send({
          success: false,
          error: 'Conflict',
          message: 'Publisher with this email already exists',
          timestamp: new Date().toISOString(),
        });
      }
      logger.error('AdminController.createPublisher error:', error);
      return reply.code(400).send({
        success: false,
        error: 'Bad Request',
        message: error.message || 'Failed to create publisher',
        timestamp: new Date().toISOString(),
      });
    }
  }

  async updatePublisher(request, reply) {
    try {
      const { error, value } = updatePublisherSchema.validate(request.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const validationErrors = error.details.map((detail) => ({
          field: detail.path.join('.'),
          message: detail.message,
        }));
        return reply.code(400).send({
          success: false,
          error: 'Validation Error',
          message: 'Request validation failed',
          details: validationErrors,
        });
      }

      const updated = await publisherService.update(request.params.id, value);
      if (!updated) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Publisher not found',
        });
      }

      return reply.send({
        success: true,
        data: updated,
      });
    } catch (error) {
      logger.error('AdminController.updatePublisher error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async deletePublisher(request, reply) {
    try {
      const deleted = await publisherService.softDelete(request.params.id);
      if (!deleted) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Publisher not found',
        });
      }
      return reply.send({ success: true, data: deleted });
    } catch (error) {
      logger.error('AdminController.deletePublisher error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async updateOffer(request, reply) {
    try {
      const { error, value } = updateOfferSchema.validate(request.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const validationErrors = error.details.map((detail) => ({
          field: detail.path.join('.'),
          message: detail.message,
        }));
        return reply.code(400).send({
          success: false,
          error: 'Validation Error',
          message: 'Request validation failed',
          details: validationErrors,
        });
      }

      const updated = await offerService.update(request.params.id, value);
      if (!updated) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Offer not found',
        });
      }

      return reply.send({
        success: true,
        data: updated,
      });
    } catch (error) {
      logger.error('AdminController.updateOffer error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async deleteOffer(request, reply) {
    try {
      const deleted = await offerService.softDelete(request.params.id);
      if (!deleted) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Offer not found',
        });
      }
      return reply.send({ success: true, data: deleted });
    } catch (error) {
      logger.error('AdminController.deleteOffer error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }
  
  async listPublishers(request, reply) {
    try {
      const filters = {
        status: request.query.status,
        email: request.query.email,
        company_name: request.query.company_name,
        page: request.query.page,
        limit: request.query.limit,
      };

      const publishers = await publisherService.findAll(filters);
      return reply.send({
        success: true,
        data: publishers.data,
        pagination: publishers.pagination,
      });
    } catch (error) {
      logger.error('AdminController.listPublishers error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }
  
  async getPublisher(request, reply) {
    try {
      const publisher = await publisherService.findById(request.params.id);
      if (!publisher) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Publisher not found',
          timestamp: new Date().toISOString(),
        });
      }
      return reply.send({
        success: true,
        data: publisher,
      });
    } catch (error) {
      logger.error('AdminController.getPublisher error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }
  
  // Offer endpoints
  async createOffer(request, reply) {
    try {
      // Validate request body
      const { error, value } = createOfferSchema.validate(request.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const validationErrors = error.details.map((detail) => ({
          field: detail.path.join('.'),
          message: detail.message,
        }));
        return reply.code(400).send({
          success: false,
          error: 'Validation Error',
          message: 'Request validation failed',
          details: validationErrors,
        });
      }

      const offer = await offerService.create(value);
      return reply.code(201).send({
        success: true,
        data: offer,
      });
    } catch (error) {
      logger.error('AdminController.createOffer error:', error);
      return reply.code(400).send(createErrorResponse(error, 400));
    }
  }
  
  async listOffers(request, reply) {
    try {
      const type = request.params.type || 'all';
      let offers;
      
      switch (type) {
        case 'live':
          offers = await offerService.getLive();
          break;
        case 'approved':
          offers = await offerService.getApproved();
          break;
        case 'all':
        default:
          offers = await offerService.getAll();
          break;
      }
      
      return reply.send({
        success: true,
        data: offers,
      });
    } catch (error) {
      logger.error('AdminController.listOffers error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }
  
  async getOfferCategories(request, reply) {
    try {
      const categories = await offerService.getCategories();
      return reply.send({
        success: true,
        data: categories,
      });
    } catch (error) {
      logger.error('AdminController.getOfferCategories error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }
  
  async getOffer(request, reply) {
    try {
      const offer = await offerService.findById(request.params.id);
      if (!offer) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Offer not found',
          timestamp: new Date().toISOString(),
        });
      }
      return reply.send({
        success: true,
        data: offer,
      });
    } catch (error) {
      logger.error('AdminController.getOffer error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }
  
  async updateOfferStatus(request, reply) {
    try {
      // Validate request body
      const { error, value } = updateOfferStatusSchema.validate(request.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const validationErrors = error.details.map((detail) => ({
          field: detail.path.join('.'),
          message: detail.message,
        }));
        return reply.code(400).send({
          success: false,
          error: 'Validation Error',
          message: 'Request validation failed',
          details: validationErrors,
        });
      }

      const { status } = value;
      const offer = await offerService.updateStatus(request.params.id, status);
      if (!offer) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Offer not found',
          timestamp: new Date().toISOString(),
        });
      }
      return reply.send({
        success: true,
        data: offer,
      });
    } catch (error) {
      logger.error('AdminController.updateOfferStatus error:', error);
      return reply.code(400).send(createErrorResponse(error, 400));
    }
  }
  
  // Assignment endpoints
  async createAssignment(request, reply) {
    try {
      // Validate request body
      const { error, value } = createAssignmentSchema.validate(request.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const validationErrors = error.details.map((detail) => ({
          field: detail.path.join('.'),
          message: detail.message,
        }));
        return reply.code(400).send({
          success: false,
          error: 'Validation Error',
          message: 'Request validation failed',
          details: validationErrors,
        });
      }

      const assignment = await assignmentService.create(value);
      return reply.code(201).send({
        success: true,
        data: assignment,
      });
    } catch (error) {
      logger.error('AdminController.createAssignment error:', error);
      return reply.code(400).send(createErrorResponse(error, 400));
    }
  }
  
  async getAssignment(request, reply) {
    try {
      const assignment = await assignmentService.findById(request.params.id);
      if (!assignment) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Assignment not found',
        });
      }
      return reply.send({ success: true, data: assignment });
    } catch (error) {
      logger.error('AdminController.getAssignment error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }

  async deleteAssignment(request, reply) {
    try {
      const ok = await assignmentService.delete(request.params.id);
      if (!ok) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Assignment not found',
        });
      }
      return reply.send({ success: true });
    } catch (error) {
      logger.error('AdminController.deleteAssignment error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }
  async listAssignments(request, reply) {
    try {
      const filters = {};
      if (request.query.publisher_id) {
        filters.publisher_id = parseInt(request.query.publisher_id);
      }
      if (request.query.offer_id) {
        filters.offer_id = parseInt(request.query.offer_id);
      }
      const assignments = await assignmentService.findAll(filters);
      return reply.send({
        success: true,
        data: assignments,
      });
    } catch (error) {
      logger.error('AdminController.listAssignments error:', error);
      return reply.code(500).send(createErrorResponse(error, 500));
    }
  }
  
  async getTrackingURL(request, reply) {
    try {
      const baseURL = process.env.TRACKING_DOMAIN || process.env.BASE_URL || 'http://localhost:3000';
      const trackingURL = await assignmentService.generateTrackingURL(
        request.params.id,
        baseURL
      );
      if (!trackingURL) {
        return reply.code(404).send({
          success: false,
          error: 'Not Found',
          message: 'Assignment not found',
        });
      }
      return reply.send({
        success: true,
        data: {
          tracking_url: trackingURL,
        },
      });
    } catch (error) {
      logger.error('AdminController.getTrackingURL error:', error);
      return reply.code(400).send(createErrorResponse(error, 400));
    }
  }
  
  // Test conversion endpoint
  async testConversion(request, reply) {
    try {
      // Validate request body
      const { error, value } = testConversionSchema.validate(request.body, {
        abortEarly: false,
        stripUnknown: true,
      });

      if (error) {
        const validationErrors = error.details.map((detail) => ({
          field: detail.path.join('.'),
          message: detail.message,
        }));
        return reply.code(400).send({
          success: false,
          error: 'Validation Error',
          message: 'Request validation failed',
          details: validationErrors,
        });
      }

      const { affiliate_url, click_id } = value;
      
      // Parse the affiliate URL to extract parameters
      const url = new URL(affiliate_url);
      const offerId = url.searchParams.get('offer_id');
      const pubId = url.searchParams.get('pub_id');
      
      if (!offerId || !pubId) {
        return reply.code(400).send({
          success: false,
          error: 'Bad Request',
          message: 'Invalid affiliate URL. Must contain offer_id and pub_id parameters.',
          timestamp: new Date().toISOString(),
        });
      }
      
      // Simulate a click if click_id not provided
      let clickUuid = click_id;
      if (!clickUuid) {
        // Create a test click
        const clickResult = await trackingService.trackClick(
          { offer_id: offerId, pub_id: pubId },
          request
        );
        clickUuid = clickResult.clickId;
      }
      
      return reply.send({
        success: true,
        message: 'Test conversion processed',
        data: {
          click_id: clickUuid,
          offer_id: offerId,
          publisher_id: pubId,
        },
      });
    } catch (error) {
      logger.error('AdminController.testConversion error:', error);
      return reply.code(400).send(createErrorResponse(error, 400));
    }
  }
}

export default new AdminController();

