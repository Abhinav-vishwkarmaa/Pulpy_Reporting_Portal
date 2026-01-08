import http from 'k6/http';
import { check, sleep } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// Configuration
export const options = {
    stages: [
        { duration: '10s', target: 130 },   // warm-up
        { duration: '10s', target: 175 },   // ramp
        { duration: '20s', target: 500 },  // high concurrency
        { duration: '10s', target: 19 },    // ramp down
    ],
    thresholds: {
        http_req_duration: ['p(95)<500'],
        http_req_failed: ['rate<0.01'],
    },
};

export default function () {
    const clickId = uuidv4(); // 🔴 CRITICAL: unique per request

    const url = `http://localhost:5001/click?offer_id=18&pub_id=1&click_id=${clickId}`;

    const params = {
        headers: {
            'User-Agent': 'k6-load-test',
        },
        redirects: 0,
        timeout: '3s', // prevent infinite waiting
    };

    const res = http.get(url, params);

    check(res, {
        'status is 302': (r) => r.status === 302,
        'response time < 200ms': (r) => r.timings.duration < 200,
    });

    sleep(0.1);
}
