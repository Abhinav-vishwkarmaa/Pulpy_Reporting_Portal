import http from 'k6/http';
import { check, sleep } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// Configuration
export const options = {
    stages: [
        { duration: '10s', target: 40 },   // warm-up
        { duration: '10s', target: 120 },   // ramp
        { duration: '20s', target: 150 },  // high concurrency
        { duration: '10s', target: 19 },    // ramp down
    ],
    thresholds: {
        http_req_duration: ['p(95)<500'],
        http_req_failed: ['rate<0.01'],
    },
};

export default function () {
    const clickId = uuidv4(); // 🔴 CRITICAL: unique per request

    const url = `https://reporting.pulpymedia.com/click?offer_id=15&pub_id=2&click_id=${clickId}`;

    const params = {
        headers: {
            'User-Agent': `k6-${__VU}-${__ITER}`,
            'X-Forwarded-For': `10.0.${__VU}.${__ITER % 255}`
        },
        redirects: 0,
        timeout: '3s', // prevent infinite waiting
    };

    const res = http.get(url, params);

    const success = check(res, {
        'status is 302': (r) => r.status === 302,
        'response time < 200ms': (r) => r.timings.duration < 200,
    });

    // Simulate Postback (Conversion) for 20% of successful clicks
    if (success && Math.random() < 1) {
        // Extract click_id from redirect URL if possible, otherwise use the one we generated
        // Since we passed click_id in, we'll try to use that (which matches how many affiliates work)
        // OR if the system generated a NEW internal ID, we should try to capture it.
        // For this test, we assume the system maps our input click_id to tid, or we just rely on the input ID
        // matching what the postback expects (if we set it up that way).

        // However, a more robust test captures the ACTUAL ID from the Location header if it's there.
        // Let's rely on the input clickId for simplicity in high-throughput testing, 
        // assuming your system stores it as `tid` and you can lookup by it (if supported) 
        // OR better: if your redirect appends `click_id=NEW_UUID`, we parse it.

        let targetClickId = clickId;
        if (res.headers['Location']) {
            const match = res.headers['Location'].match(/[?&]click_id=([^&]+)/);
            if (match) targetClickId = match[1];
        }

        // Debug: Log only once briefly to check what ID we are grabbing
        if (Math.random() < 0.001) console.log(`[Debug] Postback using ClickID: ${targetClickId}`);

        sleep(1 + Math.random() * 2); // Wait 1-3s (simulate user browsing + async worker lag)

        const postbackUrl = `https://reporting.pulpymedia.com/postback?click_id=${targetClickId}&amount=10.00`;
        const pbRes = http.get(postbackUrl);

        check(pbRes, {
            'postback status is 200': (r) => r.status === 200,
            'postback success': (r) => r.body && r.body.includes('"success":true'),
        }) || console.log(`Postback Failed! Status: ${pbRes.status}, Body: ${pbRes.body}, ClickID: ${targetClickId}`);
    }

    sleep(0.1);
}
