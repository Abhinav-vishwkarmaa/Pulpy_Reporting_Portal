import http from 'http';
import https from 'https';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5001';
const OFFER_ID = 15;
const PUB_ID = 2;

// Helper to make HTTP requests
function makeRequest(url, options = {}) {
    return new Promise((resolve, reject) => {
        const client = url.startsWith('https') ? https : http;
        const req = client.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({
                statusCode: res.statusCode,
                headers: res.headers,
                body: data
            }));
        });
        req.on('error', reject);
        req.end();
    });
}

async function runTest() {
    console.log('🚀 Starting Postback Flow Verification...');
    console.log(`Target: ${BASE_URL}`);

    // Step 1: Simulate Click
    console.log('\n1️⃣  Simulating Click...');
    const clickUrl = `${BASE_URL}/click?offer_id=${OFFER_ID}&pub_id=${PUB_ID}`;

    // Use manual HTTP request to prevent auto-redirect so we can capture headers
    const clickRes = await makeRequest(clickUrl, { method: 'GET' });

    console.log(`   Status: ${clickRes.statusCode}`);

    if (clickRes.statusCode !== 302) {
        console.error('❌ Failed: Expected 302 Redirect');
        console.error('   Response:', clickRes.body);
        return;
    }

    const location = clickRes.headers.location;
    console.log(`   Redirect Location: ${location}`);

    // Extract click_id from Location URL
    // Expected format: http://...?click_id=UUID&...
    const match = location.match(/[?&]click_id=([^&]+)/);

    if (!match) {
        console.error('❌ Failed: Could not find click_id in redirect URL');
        return;
    }

    const clickId = match[1];
    console.log(`✅ Click ID Captured: ${clickId}`);

    // Step 2: Validation Delay (Simulate real user time / Async processing)
    console.log('\n2️⃣  Waiting for async click processing (1s)...');
    await new Promise(r => setTimeout(r, 1000));

    // Step 3: Fire Postback
    console.log('\n3️⃣  Firing Postback...');
    const postbackUrl = `${BASE_URL}/postback?click_id=${clickId}&amount=10.00`;
    console.log(`   URL: ${postbackUrl}`);

    const postbackRes = await makeRequest(postbackUrl, { method: 'GET' });

    console.log(`   Status: ${postbackRes.statusCode}`);
    console.log(`   Response: ${postbackRes.body}`);

    if (postbackRes.statusCode === 200) {
        try {
            const body = JSON.parse(postbackRes.body);
            if (body.success) {
                console.log('\n✅ SUCCESS: Conversion recorded!');
            } else {
                console.log('\n⚠️  WARNING: Response 200 but success=false');
            }
        } catch (e) {
            console.log('\n⚠️  WARNING: Could not parse JSON response');
        }
    } else {
        console.error('\n❌ FAILED: Postback endpoint returned error');
    }
}

runTest().catch(console.error);
