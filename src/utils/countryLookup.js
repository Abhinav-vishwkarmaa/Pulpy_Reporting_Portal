import geoip from 'geoip-lite';

/**
 * Extracts location details from IP using geoip-lite.
 * Returns { country, region, city }.
 */
export function getLocationFromIP(ip) {
  if (!ip || ip === '::1' || ip === '127.0.0.1') {
    return { country: null, region: null, city: null };
  }

  try {
    const geo = geoip.lookup(ip);
    if (geo) {
      return {
        country: geo.country || null,
        region: geo.region || null,
        city: geo.city || null
      };
    }
  } catch (err) {
    // Silent fail for geo lookup
  }
  return { country: null, region: null, city: null };
}

/**
 * Fallback to standard Cloudflare header if GeoIP fails or is not desired
 */
export function getCountryFromHeaders(request) {
  return request.headers['cf-ipcountry'] || null;
}
