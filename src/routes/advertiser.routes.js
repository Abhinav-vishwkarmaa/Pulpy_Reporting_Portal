import advertiserController from '../controllers/advertiser.controller.js';
import { authenticateAdmin } from '../middleware/auth.js';
import {
  advertiserIdParamSchema,
  createAdvertiserSchema,
  updateAdvertiserSchema,
  listAdvertisersQuerySchema,
} from '../schemas/advertiser.schema.js';

async function advertiserRoutes(fastify) {
  // Protect all advertiser routes with JWT
  fastify.addHook('onRequest', authenticateAdmin);

  fastify.post(
    '/api/admin/advertisers',
    {
      schema: {
        body: createAdvertiserSchema,
      },
    },
    advertiserController.createAdvertiser
  );

  fastify.patch(
    '/api/admin/advertisers/:id',
    {
      schema: {
        params: advertiserIdParamSchema,
        body: updateAdvertiserSchema,
      },
    },
    advertiserController.updateAdvertiser
  );

  fastify.get(
    '/api/admin/advertisers',
    {
      schema: {
        querystring: listAdvertisersQuerySchema,
      },
    },
    advertiserController.listAdvertisers
  );

  fastify.get(
    '/api/admin/advertisers/:id',
    {
      schema: {
        params: advertiserIdParamSchema,
      },
    },
    advertiserController.getAdvertiser
  );

  fastify.delete(
    '/api/admin/advertisers/:id',
    {
      schema: {
        params: advertiserIdParamSchema,
      },
    },
    advertiserController.deleteAdvertiser
  );
}

export default advertiserRoutes;
