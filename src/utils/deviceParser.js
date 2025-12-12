/**
 * Device parsing utilities
 * Parses user agent to extract device information
 */

export function parseDevice(userAgent) {
  if (!userAgent) {
    return {
      deviceType: null,
      browser: null,
      os: null,
      osVersion: null,
      deviceBrand: null,
      deviceModel: null,
    };
  }

  const ua = userAgent.toLowerCase();
  
  // Device Type
  let deviceType = 'Desktop';
  if (ua.includes('mobile') || ua.includes('android') || ua.includes('iphone')) {
    deviceType = 'Mobile';
  } else if (ua.includes('tablet') || ua.includes('ipad')) {
    deviceType = 'Tablet';
  }
  
  // OS Detection
  let os = null;
  let osVersion = null;
  
  if (ua.includes('android')) {
    os = 'Android';
    const match = ua.match(/android\s([0-9\.]*)/);
    osVersion = match ? match[1] : null;
  } else if (ua.includes('iphone') || ua.includes('ipad')) {
    os = 'iOS';
    const match = ua.match(/os\s([0-9_]*)/);
    osVersion = match ? match[1].replace(/_/g, '.') : null;
  } else if (ua.includes('windows')) {
    os = 'Windows';
    const match = ua.match(/windows nt\s([0-9\.]*)/);
    osVersion = match ? match[1] : null;
  } else if (ua.includes('mac os')) {
    os = 'macOS';
    const match = ua.match(/mac os x\s([0-9_]*)/);
    osVersion = match ? match[1].replace(/_/g, '.') : null;
  } else if (ua.includes('linux')) {
    os = 'Linux';
  }
  
  // Browser Detection
  let browser = null;
  if (ua.includes('chrome') && !ua.includes('edg')) {
    browser = 'Chrome';
  } else if (ua.includes('firefox')) {
    browser = 'Firefox';
  } else if (ua.includes('safari') && !ua.includes('chrome')) {
    browser = 'Safari';
  } else if (ua.includes('edg')) {
    browser = 'Edge';
  } else if (ua.includes('opera') || ua.includes('opr')) {
    browser = 'Opera';
  }
  
  // Device Brand/Model (for mobile)
  let deviceBrand = null;
  let deviceModel = null;
  
  if (ua.includes('iphone')) {
    deviceBrand = 'Apple';
    deviceModel = 'iPhone';
  } else if (ua.includes('ipad')) {
    deviceBrand = 'Apple';
    deviceModel = 'iPad';
  } else if (ua.includes('samsung')) {
    deviceBrand = 'Samsung';
    const match = ua.match(/samsung[\/\s]([a-z0-9-]+)/i);
    deviceModel = match ? match[1] : null;
  } else if (ua.includes('xiaomi')) {
    deviceBrand = 'Xiaomi';
    const match = ua.match(/xiaomi[\/\s]([a-z0-9-]+)/i);
    deviceModel = match ? match[1] : null;
  } else if (ua.includes('huawei')) {
    deviceBrand = 'Huawei';
    const match = ua.match(/huawei[\/\s]([a-z0-9-]+)/i);
    deviceModel = match ? match[1] : null;
  } else if (ua.includes('oneplus')) {
    deviceBrand = 'OnePlus';
    const match = ua.match(/oneplus[\/\s]([a-z0-9-]+)/i);
    deviceModel = match ? match[1] : null;
  }
  
  return {
    deviceType,
    browser,
    os,
    osVersion,
    deviceBrand,
    deviceModel,
  };
}

