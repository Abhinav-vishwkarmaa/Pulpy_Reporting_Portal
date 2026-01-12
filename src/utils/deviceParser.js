import { UAParser } from 'ua-parser-js';

// Specific patterns for social apps that might not be fully caught or need specific Mobile categorization
const SOCIAL_BOTS = ['WhatsApp', 'Instagram', 'FBAN', 'FB_IAB', 'Twitter', 'Snapchat', 'LinkedInApp'];

export function parseDevice(userAgent) {
  if (!userAgent) {
    return {
      deviceType: 'Unknown',
      browser: 'Unknown',
      os: 'Unknown',
      osVersion: 'Unknown',
      deviceBrand: 'Unknown',
      deviceModel: 'Unknown'
    };
  }

  const parser = new UAParser(userAgent);
  const result = parser.getResult();

  // 1. Basic Extraction
  let browser = result.browser.name || 'Unknown';
  let os = result.os.name || 'Unknown';
  let osVersion = result.os.version || 'Unknown';
  let deviceType = result.device.type || 'Desktop'; // Default to Desktop if undefined
  let deviceBrand = result.device.vendor || 'Unknown';
  let deviceModel = result.device.model || 'Unknown';

  // 2. Fix "Desktop" default for Mobile Apps (WhatsApp, FB, etc.)
  // Many in-app browsers don't set device.type correctly in standard parsers
  const ua = userAgent.toLowerCase();

  // Check if it's actually a mobile device based on OS or keywords if type is Desktop/undefined
  if (deviceType === 'Desktop' || !result.device.type) {
    if (os === 'Android' || os === 'iOS' || ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
      deviceType = 'Mobile';
    } else if (ua.includes('tablet') || ua.includes('ipad')) {
      deviceType = 'Tablet';
    }
  }

  // 3. Detect Social/In-App Browsers
  // If browser is generic "WebKit" or "Chrome Mobile" inside an app, we might want to know the *App*
  // Checks for Facebook, Instagram, WhatsApp
  if (ua.includes('whatsapp')) {
    browser = 'WhatsApp';
    deviceType = deviceType === 'Desktop' ? 'Mobile' : deviceType; // Force mobile for WhatsApp usually
  } else if (ua.includes('instagram')) {
    browser = 'Instagram';
    deviceType = 'Mobile';
  } else if (ua.includes('fban') || ua.includes('fbav')) {
    browser = 'Facebook';
    deviceType = 'Mobile';
  } else if (ua.includes('snapchat')) {
    browser = 'Snapchat';
    deviceType = 'Mobile';
  } else if (ua.includes('linkedinapp')) {
    browser = 'LinkedIn';
    deviceType = 'Mobile';
  } else if (ua.includes('bytearray') || ua.includes('tiktok')) { // TikTok often uses different UAs
    browser = 'TikTok';
    deviceType = 'Mobile';
  }

  // 4. Refine Device Model if possible (simple heuristic extensions if needed)
  // ua-parser-js is usually good, but sometimes returns undefined for generic androids
  if (deviceBrand === 'Unknown' && os === 'Android' && deviceType === 'Mobile') {
    // Try fallback parsing for some common formats if ua-parser missed it
    // e.g. "Build/SM-G990B"
    const buildMatch = ua.match(/\s([a-z0-9]+(-[a-z0-9]+)+)\sbuild\//i);
    if (buildMatch) {
      deviceModel = buildMatch[1];
      deviceBrand = 'Generic Android'; // Hard to guess brand solely from model sometimes
    }
  }

  return {
    deviceType: capitalize(deviceType),
    browser: browser,
    os: os,
    osVersion: osVersion,
    deviceBrand: deviceBrand,
    deviceModel: deviceModel
  };
}

function capitalize(str) {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}
