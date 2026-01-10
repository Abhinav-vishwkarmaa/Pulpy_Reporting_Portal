import logger from '../utils/logger.js';

// Store request start times
const requestTimers = new Map();

// RPS Monitor
if (!global.rpsCounter) global.rpsCounter = 0;
if (!global.totalRequests) global.totalRequests = 0;
if (!global.lastRps) global.lastRps = 0;

// Start RPS Logger (Singleton)
if (!global.rpsTimer) {
  global.rpsTimer = setInterval(() => {
    if (global.rpsCounter > 0) {
      console.log(`\n📊 [RPS MONITOR] ${new Date().toISOString().split('T')[1].split('.')[0]} | Rate: ${global.rpsCounter} req/sec | Total: ${global.totalRequests}`);
    }
    global.lastRps = global.rpsCounter;
    global.rpsCounter = 0;
  }, 1000);
}

export async function requestLogger(request, reply) {
  const start = Date.now();
  const requestId = request.id || `${Date.now()}-${Math.random()}`;
  requestTimers.set(requestId, start);
  request.requestId = requestId;

  // Increment counters
  global.rpsCounter = (global.rpsCounter || 0) + 1;
  global.totalRequests = (global.totalRequests || 0) + 1;

  // ADAPTIVE LOGGING: If load is high (> 50 RPS), suppress verbose console logs
  if (global.lastRps > 50) return;

  const timestamp = new Date().toISOString();

  // Extract request details
  const method = request.method.padEnd(7);
  const url = request.url;
  const ip = request.ip || request.socket?.remoteAddress || 'unknown';
  const userAgent = request.headers['user-agent'] || 'N/A';
  const referer = request.headers.referer || request.headers.referrer || 'N/A';

  // Log incoming request with clear formatting
  console.log('\n' + '='.repeat(80));
  console.log(`📥 INCOMING REQUEST [${timestamp}]`);
  console.log(`   Method: ${method} | URL: ${url}`);
  console.log(`   IP: ${ip}`);
  console.log(`   User-Agent: ${userAgent.substring(0, 100)}${userAgent.length > 100 ? '...' : ''}`);
  if (referer !== 'N/A') {
    console.log(`   Referer: ${referer.substring(0, 100)}${referer.length > 100 ? '...' : ''}`);
  }

  // Log query parameters if present
  if (Object.keys(request.query || {}).length > 0) {
    console.log(`   Query: ${JSON.stringify(request.query)}`);
  }

  // Log request body for POST/PUT/PATCH (truncated for large payloads)
  if (['POST', 'PUT', 'PATCH'].includes(request.method) && request.body) {
    const bodyStr = JSON.stringify(request.body);
    const truncated = bodyStr.length > 200 ? bodyStr.substring(0, 200) + '...' : bodyStr;
    console.log(`   Body: ${truncated}`);
  }
}

// Response logger hook (must be registered separately)
export async function responseLogger(request, reply) {
  const requestId = request.requestId || request.id;
  const start = requestTimers.get(requestId) || Date.now();
  const duration = Date.now() - start;
  requestTimers.delete(requestId);

  const timestamp = new Date().toISOString();
  const method = request.method.padEnd(7);
  const url = request.url;
  const statusCode = reply.statusCode;

  // Determine status emoji and color
  let statusEmoji = '✅';
  let statusText = 'SUCCESS';
  if (statusCode >= 400 && statusCode < 500) {
    statusEmoji = '⚠️';
    statusText = 'CLIENT ERROR';
  } else if (statusCode >= 500) {
    statusEmoji = '❌';
    statusText = 'SERVER ERROR';
  } else if (statusCode >= 300 && statusCode < 400) {
    statusEmoji = '↪️';
    statusText = 'REDIRECT';
  }

  // Log response
  console.log(`📤 RESPONSE [${timestamp}]`);
  console.log(`   ${statusEmoji} ${method} ${url}`);
  console.log(`   Status: ${statusCode} ${statusText} | Duration: ${duration}ms`);

  // Log response body for errors (if available in reply context)
  if (statusCode >= 400 && reply.sent) {
    // Error details are already logged by error handler
    console.log(`   └─ See error details above`);
  }

  console.log('='.repeat(80) + '\n');
}

