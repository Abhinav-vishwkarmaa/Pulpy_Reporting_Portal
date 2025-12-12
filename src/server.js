import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import dotenv from 'dotenv';
import logger from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { requestLogger, responseLogger } from './middleware/requestLogger.js';

// Load environment variables
dotenv.config();

// Import routes
import authRoutes from './routes/auth.js';
import adminRoutes from './routes/admin.js';
import advertiserRoutes from './routes/advertiser.routes.js';
import offerRoutes from './routes/offer.routes.js';
import trackingRoutes from './routes/tracking.js';
import postbackRoutes from './routes/postback.js';
import reportRoutes from './routes/reports.js';

const fastify = Fastify({
  logger: logger,
  requestIdLogLabel: 'reqId',
  disableRequestLogging: false,
});

// Initialize server
async function initializeServer() {
  // Register plugins
  await fastify.register(cors, {
    origin: true, // allow all origins/ports
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
    exposedHeaders: ['Content-Length', 'Content-Type'],
  });

  await fastify.register(helmet, {
    contentSecurityPolicy: false, // Allow tracking pixels
  });

  await fastify.register(rateLimit, {
    max: 1000,
    timeWindow: '1 minute',
    skipOnError: true,
  });

  // Register middleware
  fastify.addHook('onRequest', requestLogger);
  fastify.addHook('onResponse', responseLogger);
  fastify.setErrorHandler(errorHandler);

  // Health check
  fastify.get('/health', async (request, reply) => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // Register routes
  await fastify.register(authRoutes, { prefix: '/api/auth' });
  await fastify.register(adminRoutes, { prefix: '/api/admin' });
  await fastify.register(advertiserRoutes);
  await fastify.register(offerRoutes);
  await fastify.register(trackingRoutes);
  await fastify.register(postbackRoutes);
  await fastify.register(reportRoutes, { prefix: '/api/admin/reports' });

  // 404 Not Found Handler - Enhanced with better logging (must be after routes)
  fastify.setNotFoundHandler((request, reply) => {
  const timestamp = new Date().toISOString();
  const method = request.method;
  const url = request.url;
  const ip = request.ip || request.socket?.remoteAddress || 'unknown';
  const userAgent = request.headers['user-agent'] || 'N/A';
  
  // Log 404 with clear formatting
  console.log('\n' + '='.repeat(80));
  console.log(`⚠️  404 NOT FOUND [${timestamp}]`);
  console.log(`   Request: ${method} ${url}`);
  console.log(`   IP: ${ip}`);
  console.log(`   User-Agent: ${userAgent.substring(0, 100)}${userAgent.length > 100 ? '...' : ''}`);
  console.log(`   ┌─ Available Endpoints ───────────────────────────────────────────────`);
  console.log(`   │ Admin APIs:`);
  console.log(`   │   POST   /api/admin/publishers`);
  console.log(`   │   GET    /api/admin/publishers`);
  console.log(`   │   GET    /api/admin/publishers/:id`);
  console.log(`   │   POST   /api/admin/offers`);
  console.log(`   │   GET    /api/admin/offers/:type (all/live/approved)`);
  console.log(`   │   GET    /api/admin/offers/categories`);
  console.log(`   │   GET    /api/admin/offers/single/:id`);
  console.log(`   │   PATCH  /api/admin/offers/:id/status`);
  console.log(`   │   POST   /api/admin/assignments`);
  console.log(`   │   GET    /api/admin/assignments`);
  console.log(`   │   GET    /api/admin/assignments/:id/tracking-url`);
  console.log(`   │   POST   /api/admin/test-conversion`);
  console.log(`   │`);
  console.log(`   │ Tracking APIs:`);
  console.log(`   │   GET    /click?offer_id=X&pub_id=Y&tid=...`);
  console.log(`   │   GET    /imp?offer_id=X&pub_id=Y`);
  console.log(`   │`);
  console.log(`   │ Postback API:`);
  console.log(`   │   GET    /postback?click_id=X&rcid=Y&amount=Z`);
  console.log(`   │   POST   /postback`);
  console.log(`   │`);
  console.log(`   │ Reporting APIs:`);
  console.log(`   │   GET    /api/admin/reports/dashboard`);
  console.log(`   │   GET    /api/admin/reports/summary`);
  console.log(`   │   GET    /api/admin/reports/detailed`);
  console.log(`   │`);
  console.log(`   │ Health Check:`);
  console.log(`   │   GET    /health`);
  console.log(`   └────────────────────────────────────────────────────────────────────`);
  console.log('='.repeat(80) + '\n');
  
  reply.code(404).send({
    success: false,
    error: 'Not Found',
    message: `The requested endpoint ${method} ${url} was not found on this server`,
    path: url,
    method: method,
    availableEndpoints: {
      admin: {
        base: '/api/admin',
        endpoints: [
          'POST /publishers',
          'GET /publishers',
          'GET /publishers/:id',
          'POST /offers',
          'GET /offers/:type',
          'GET /offers/categories',
          'GET /offers/single/:id',
          'PATCH /offers/:id/status',
          'POST /assignments',
          'GET /assignments',
          'GET /assignments/:id/tracking-url',
          'POST /test-conversion',
        ],
      },
      tracking: {
        endpoints: [
          'GET /click',
          'GET /imp',
        ],
      },
      postback: {
        endpoints: [
          'GET /postback',
          'POST /postback',
        ],
      },
      reports: {
        base: '/api/admin/reports',
        endpoints: [
          'GET /dashboard',
          'GET /summary',
          'GET /detailed',
        ],
      },
      health: {
        endpoints: [
          'GET /health',
        ],
      },
    },
    timestamp,
  });
  });
}

// Start server
const start = async () => {
  try {
    // Initialize server (register plugins and routes)
    await initializeServer();
    
    const port = parseInt(process.env.PORT || '5000');
    const host = process.env.HOST || '0.0.0.0';
    
    await fastify.listen({ port, host });
    logger.info(`\n🚀 Server started successfully!`);
    logger.info(`   Listening on ${host}:${port}`);
    logger.info(`   Environment: ${process.env.NODE_ENV || 'development'}\n`);
  } catch (err) {
    console.error('\n❌ Failed to start server:');
    console.error(err);
    fastify.log.error(err);
    process.exit(1);
  }
};

start();

