/**
 * IP extraction utilities
 * Extracts real IP from request headers
 */

export function extractIP(request) {
  // Check various headers for real IP (considering proxies/load balancers)
  const forwarded = request.headers['x-forwarded-for'];
  if (forwarded) {
    const ips = forwarded.split(',');
    return ips[0].trim();
  }
  
  const realIP = request.headers['x-real-ip'];
  if (realIP) {
    return realIP;
  }
  
  const cfConnectingIP = request.headers['cf-connecting-ip'];
  if (cfConnectingIP) {
    return cfConnectingIP;
  }
  
  // Fallback to socket remote address
  return request.socket?.remoteAddress || request.ip || 'unknown';
}

