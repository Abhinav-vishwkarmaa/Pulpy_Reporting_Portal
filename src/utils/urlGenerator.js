/**
 * URL generation utilities
 */

import crypto from 'crypto';

/**
 * Generate a unique, URL-safe click_id (max 36 characters to match database CHAR(36))
 * Uses cryptographically secure random bytes for production-grade security
 * Format: Base64URL encoded random bytes (URL-safe, no padding)
 * 
 * @param {number} length - Desired length (default: 36, max: 36 to match database schema)
 * @returns {string} - URL-safe click_id
 * 
 * Example output: "2092Y7avpRzmwWRY7aFjF2bS53VM4jjYK5f"
 */
export function generateClickId(length = 36) {
  // Database column is CHAR(36), so limit to 36 characters
  const validLength = Math.min(36, length || 36);

  // Generate cryptographically secure random bytes
  // We need (length * 3/4) bytes to get approximately 'length' characters after base64 encoding
  const bytesNeeded = Math.ceil(validLength * 0.75);
  const randomBytes = crypto.randomBytes(bytesNeeded);

  // Convert to Base64URL (URL-safe, no padding)
  // Base64URL uses - and _ instead of + and /, and removes = padding
  let clickId = randomBytes.toString('base64url');

  // Trim to exact length (36 chars max to match database CHAR(36))
  if (clickId.length > validLength) {
    clickId = clickId.substring(0, validLength);
  }

  // Ensure minimum length by padding if necessary
  while (clickId.length < validLength) {
    const additionalBytes = crypto.randomBytes(8);
    clickId += additionalBytes.toString('base64url');
  }

  // Final trim to ensure we don't exceed 36 characters (database limit)
  return clickId.substring(0, 36);
}

/**
 * Normalize base URL - remove duplicate protocols and trailing slashes
 * @param {string} url - URL to normalize
 * @returns {string} - Normalized URL
 */
function normalizeBaseURL(url) {
  if (!url) return url;

  let normalized = url.trim();

  // Remove duplicate protocol prefixes (e.g., http://http:// or https://https://)
  normalized = normalized.replace(/^(https?:\/\/)+/i, (match) => {
    // Keep only the first protocol
    const protocols = match.split('://');
    return protocols[0] + '://';
  });

  // Ensure baseURL doesn't end with a slash
  normalized = normalized.replace(/\/+$/, '');

  return normalized;
}

export function generateTrackingURL(baseURL, offerId, publisherId, params = {}) {
  // Normalize baseURL to handle duplicate protocols
  const normalizedBaseURL = normalizeBaseURL(baseURL);

  // Build URL manually to avoid URL-encoding curly braces
  let url = `${normalizedBaseURL}/click?offer_id=${offerId}&pub_id=${publisherId}`;

  // Add click_id if provided (can be placeholder like {click_id} or actual value)
  if (params.click_id) {
    // Don't encode if it's a placeholder (contains curly braces)
    if (params.click_id.includes('{') || params.click_id.includes('}')) {
      url += `&click_id=${params.click_id}`;
    } else {
      url += `&click_id=${encodeURIComponent(params.click_id)}`;
    }
  }

  // Note: rcid is NOT included - removed as per requirements

  // Add optional parameters (excluding rcid)
  if (params.tid) url += `&tid=${params.tid}`;
  if (params.source_id) url += `&source_id=${params.source_id}`;
  if (params.device_id) url += `&device_id=${params.device_id}`;
  if (params.google_id) url += `&google_id=${params.google_id}`;
  if (params.android_id) url += `&android_id=${params.android_id}`;

  return url;
}

/**
 * Generate tracking URL in alternative format (oid, m, a parameters)
 * Example: domain.com?oid=o0108&m=ad7877&a=af0064&rcid={replace_it}
 */
export function generateAlternativeTrackingURL(baseURL, offerId, publisherId, advertiserId = null, params = {}) {
  // Normalize baseURL to handle duplicate protocols
  const normalizedBaseURL = normalizeBaseURL(baseURL);

  const url = new URL(normalizedBaseURL);

  // Use alternative parameter names
  url.searchParams.set('oid', offerId);      // offer_id
  url.searchParams.set('a', publisherId);    // affiliate/publisher_id
  if (advertiserId) url.searchParams.set('m', advertiserId); // merchant/advertiser_id

  // Add optional parameters
  if (params.tid) url.searchParams.set('tid', params.tid);
  if (params.rcid) url.searchParams.set('rcid', params.rcid);
  if (params.source_id) url.searchParams.set('source_id', params.source_id);

  return url.toString();
}

export function extractDomain(referrer) {
  if (!referrer) return null;

  try {
    const url = new URL(referrer);
    return url.hostname;
  } catch (e) {
    return null;
  }
}

/**
 * Replace macros in URLs with actual values
 * Supported macros: {click_id}, {clickid}, {CLICK_ID}, {REPLACE}, {replace}, {rcid}, {RCID}, {tid}, {TID}
 */
export function replaceMacros(url, macroValues = {}) {
  if (!url) return url;

  let result = url;

  // Replace macros (case-insensitive)
  if (macroValues.click_id) {
    result = result.replace(/{click_id}/gi, macroValues.click_id);
    result = result.replace(/{clickid}/gi, macroValues.click_id);  // Support clickid without underscore
    result = result.replace(/{CLICK_ID}/gi, macroValues.click_id);
    result = result.replace(/{REPLACE}/gi, macroValues.click_id);  // Support {REPLACE} macro
    result = result.replace(/{replace}/gi, macroValues.click_id);  // Support {replace} (lowercase)
    // Support angle brackets format
    result = result.replace(/<click_id>/gi, macroValues.click_id);
    result = result.replace(/<clickid>/gi, macroValues.click_id);
    result = result.replace(/<CLICK_ID>/gi, macroValues.click_id);
  }
  if (macroValues.rcid) {
    result = result.replace(/{rcid}/gi, macroValues.rcid);
    result = result.replace(/{RCID}/gi, macroValues.rcid);
  }
  if (macroValues.tid) {
    result = result.replace(/{tid}/gi, macroValues.tid);
    result = result.replace(/{TID}/gi, macroValues.tid);
  }

  return result;
}

export function appendClickParams(offerUrl, clickData) {
  // Helper to check if value contains macros (curly braces) - these shouldn't be URL-encoded
  const hasMacros = (value) => value && typeof value === 'string' && (value.includes('{') || value.includes('}'));

  // Helper to check if value is only a macro placeholder (like {TID}, {RCID}) - skip these
  const isOnlyMacro = (value) => value && typeof value === 'string' && /^\{[A-Z_]+\}$/i.test(value.trim());

  // Helper to check if a parameter already exists in URL (case-insensitive)
  const hasParam = (urlObj, paramName) => {
    // Check both the exact name and common variations
    const lowerParam = paramName.toLowerCase();
    for (const [key] of urlObj.searchParams.entries()) {
      if (key.toLowerCase() === lowerParam) return true;
    }
    // Also check for clickid vs click_id
    if (lowerParam === 'click_id' || lowerParam === 'clickid') {
      for (const [key] of urlObj.searchParams.entries()) {
        if (key.toLowerCase() === 'click_id' || key.toLowerCase() === 'clickid') return true;
      }
    }
    return false;
  };

  try {
    const url = new URL(offerUrl);
    const paramsToAppend = [];

    // Add click_id parameter only if it doesn't already exist (check for both click_id and clickid)
    if (clickData.click_id && !hasParam(url, 'click_id') && !hasParam(url, 'clickid')) {
      paramsToAppend.push(`click_id=${clickData.click_id}`);
    }

    // Handle parameters that might contain macros - skip if it's only a macro placeholder
    if (clickData.tid && !isOnlyMacro(clickData.tid) && !hasParam(url, 'tid')) {
      if (hasMacros(clickData.tid)) {
        paramsToAppend.push(`tid=${clickData.tid}`); // Preserve macros without encoding
      } else {
        url.searchParams.set('tid', clickData.tid);
      }
    }
    if (clickData.rcid && !isOnlyMacro(clickData.rcid) && !hasParam(url, 'rcid')) {
      if (hasMacros(clickData.rcid)) {
        paramsToAppend.push(`rcid=${clickData.rcid}`);
      } else {
        url.searchParams.set('rcid', clickData.rcid);
      }
    }

    // Add other parameters normally (no macros expected) - only if they don't exist
    if (clickData.source_id && !hasParam(url, 'source_id')) {
      url.searchParams.set('source_id', clickData.source_id);
    }
    if (clickData.device_id && !hasParam(url, 'device_id')) {
      url.searchParams.set('device_id', clickData.device_id);
    }
    if (clickData.google_id && !hasParam(url, 'google_id')) {
      url.searchParams.set('google_id', clickData.google_id);
    }
    if (clickData.android_id && !hasParam(url, 'android_id')) {
      url.searchParams.set('android_id', clickData.android_id);
    }

    // Append params with macros directly to avoid URL encoding
    if (paramsToAppend.length > 0) {
      const separator = url.search ? '&' : '?';
      return url.toString() + separator + paramsToAppend.join('&');
    }

    return url.toString();
  } catch (e) {
    // If offerUrl is not a valid URL, check manually for existing parameters
    const isOnlyMacro = (value) => value && typeof value === 'string' && /^\{[A-Z_]+\}$/i.test(value.trim());

    // Check if parameters already exist in the URL string
    const urlLower = offerUrl.toLowerCase();
    const hasClickId = urlLower.includes('click_id=') || urlLower.includes('clickid=');
    const hasTid = urlLower.includes('tid=');
    const hasRcid = urlLower.includes('rcid=');

    const separator = offerUrl.includes('?') ? '&' : '?';
    const params = [];

    if (clickData.click_id && !hasClickId) {
      params.push(`click_id=${clickData.click_id}`);
    }
    if (clickData.tid && !isOnlyMacro(clickData.tid) && !hasTid) {
      params.push(`tid=${clickData.tid}`);
    }
    if (clickData.rcid && !isOnlyMacro(clickData.rcid) && !hasRcid) {
      params.push(`rcid=${clickData.rcid}`);
    }

    if (params.length === 0) {
      return offerUrl;
    }

    return `${offerUrl}${separator}${params.join('&')}`;
  }
}

