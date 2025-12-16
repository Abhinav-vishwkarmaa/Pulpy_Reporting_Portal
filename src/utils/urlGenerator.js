/**
 * URL generation utilities
 */

export function generateTrackingURL(baseURL, offerId, publisherId, params = {}) {
  const url = new URL(`${baseURL}/click`);
  url.searchParams.set('offer_id', offerId);
  url.searchParams.set('pub_id', publisherId);
  
  // Add optional parameters
  if (params.tid) url.searchParams.set('tid', params.tid);
  if (params.rcid) url.searchParams.set('rcid', params.rcid);
  if (params.source_id) url.searchParams.set('source_id', params.source_id);
  if (params.device_id) url.searchParams.set('device_id', params.device_id);
  if (params.google_id) url.searchParams.set('google_id', params.google_id);
  if (params.android_id) url.searchParams.set('android_id', params.android_id);
  
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
 * Supported macros: {click_id}, {CLICK_ID}, {rcid}, {RCID}, {tid}, {TID}
 */
export function replaceMacros(url, macroValues = {}) {
  if (!url) return url;
  
  let result = url;
  
  // Replace macros (case-insensitive)
  if (macroValues.click_id) {
    result = result.replace(/{click_id}/gi, macroValues.click_id);
    result = result.replace(/{CLICK_ID}/gi, macroValues.click_id);
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
  try {
    const url = new URL(offerUrl);
    
    if (clickData.click_id) url.searchParams.set('click_id', clickData.click_id);
    if (clickData.tid) url.searchParams.set('tid', clickData.tid);
    if (clickData.rcid) url.searchParams.set('rcid', clickData.rcid);
    if (clickData.source_id) url.searchParams.set('source_id', clickData.source_id);
    if (clickData.device_id) url.searchParams.set('device_id', clickData.device_id);
    if (clickData.google_id) url.searchParams.set('google_id', clickData.google_id);
    if (clickData.android_id) url.searchParams.set('android_id', clickData.android_id);
    
    return url.toString();
  } catch (e) {
    // If offerUrl is not a valid URL, just append params as query string
    const separator = offerUrl.includes('?') ? '&' : '?';
    const params = [];
    if (clickData.click_id) params.push(`click_id=${clickData.click_id}`);
    if (clickData.tid) params.push(`tid=${clickData.tid}`);
    if (clickData.rcid) params.push(`rcid=${clickData.rcid}`);
    return `${offerUrl}${separator}${params.join('&')}`;
  }
}

