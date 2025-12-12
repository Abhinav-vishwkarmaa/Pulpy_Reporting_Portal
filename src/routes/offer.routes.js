import offerController from '../controllers/offer.controller.js';
import { authenticateAdmin } from '../middleware/auth.js';
import {
  changeOfferStatusSchema,
  createOfferSchema,
  listOffersQuerySchema,
  offerIdParamSchema,
  updateOfferSchema,
} from '../schemas/offer.schema.js';

async function offerRoutes(fastify) {
  // Protected routes (create/update/delete/status)
  fastify.post(
    '/api/admin/offers',
    {
      preHandler: authenticateAdmin,
      schema: {
        body: createOfferSchema,
      },
    },
    offerController.createOffer
  );

  fastify.patch(
    '/api/admin/offers/:id',
    {
      preHandler: authenticateAdmin,
      schema: {
        params: offerIdParamSchema,
        body: updateOfferSchema,
      },
    },
    offerController.updateOffer
  );

  fastify.patch(
    '/api/admin/offers/:id/status',
    {
      preHandler: authenticateAdmin,
      schema: {
        params: offerIdParamSchema,
        body: changeOfferStatusSchema,
      },
    },
    offerController.changeStatus
  );

  fastify.delete(
    '/api/admin/offers/:id',
    {
      preHandler: authenticateAdmin,
      schema: {
        params: offerIdParamSchema,
      },
    },
    offerController.deleteOffer
  );

  // Public GETs
  fastify.get(
    '/api/admin/offers',
    {
      schema: {
        querystring: listOffersQuerySchema,
      },
    },
    offerController.listOffers
  );

  fastify.get(
    '/api/admin/offers/:id',
    {
      schema: {
        params: offerIdParamSchema,
      },
    },
    offerController.getOffer
  );
}

export default offerRoutes;