import authController from '../controllers/authController.js';
import { authenticateAdmin } from '../middleware/auth.js';

async function authRoutes(fastify, options) {
  // Public routes (no auth required)
  fastify.post('/register', authController.register);
  fastify.post('/login', authController.login);
  
  // Protected route (requires auth)
  fastify.get('/profile', {
    preHandler: authenticateAdmin,
  }, authController.getProfile);
}

export default authRoutes;

