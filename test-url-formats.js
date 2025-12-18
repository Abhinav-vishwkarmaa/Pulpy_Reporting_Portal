import { generateTrackingURL, generateAlternativeTrackingURL, replaceMacros, appendClickParams } from './src/utils/urlGenerator.js';

console.log('🧪 Testing URL Format Support\n');

// Test data
const baseURL = 'https://your-domain.com';
const offerId = 'o0108';
const publisherId = 'af0064';
const advertiserId = 'ad7877';
const clickId = '123e4567-e89b-12d3-a456-426614174000';

// Test 1: Standard tracking URL generation
console.log('1. Standard Tracking URL:');
const standardURL = generateTrackingURL(baseURL, offerId, publisherId, { rcid: 'test123' });
console.log(`   ${standardURL}`);

// Test 2: Alternative tracking URL generation
console.log('\n2. Alternative Tracking URL:');
const alternativeURL = generateAlternativeTrackingURL(baseURL, offerId, publisherId, advertiserId, { rcid: '{replace_it}' });
console.log(`   ${alternativeURL}`);

// Test 3: Macro replacement with their offer URL
console.log('\n3. Offer URL Macro Replacement:');
const offerURL = 'https://4839976.s2.clicksrefresh.com/?mob=nKDMyUyTd5XYwGe13Nzal0Y0VijLC6gM4fU74YPovRU&clickid={click_id}';
const replacedOfferURL = replaceMacros(offerURL, { click_id: clickId });
console.log(`   Original: ${offerURL}`);
console.log(`   Replaced: ${replacedOfferURL}`);

// Test 4: Click parameter appending
console.log('\n4. Click Parameter Appending:');
const appendedURL = appendClickParams(offerURL, { click_id: clickId, rcid: 'test123' });
console.log(`   Appended: ${appendedURL}`);

console.log('\n✅ URL format tests completed!');
