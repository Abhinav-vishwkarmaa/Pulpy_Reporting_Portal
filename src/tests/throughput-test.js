import http from 'k6/http';
import { check, sleep } from 'k6';
import { uuidv4 } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

/*
  ===== PROPER THROUGHPUT TEST =====
  - Constant arrival rate
  - Accepts overload (429) as VALID
  - Fails only on timeouts / 5xx
*/

export const options = {
  scenarios: {
    click_throughput: {
      executor: 'constant-arrival-rate',
      rate: 1000,           // clicks per second
      timeUnit: '1s',
      duration: '60s',
      preAllocatedVUs: 200,
      maxVUs: 400,
    },
  },

  thresholds: {
    // ❗ Only fail if server truly breaks
    http_req_failed: ['rate<0.05'],        // allow overload
    http_req_duration: ['p(95)<2000'],
  },
};

const BASE_URL = 'http://localhost:5001';

export default function () {
  const clickId = uuidv4();

  const res = http.get(
    `${BASE_URL}/click?offer_id=15&pub_id=2&click_id=${clickId}`,
    {
      redirects: 0,
      timeout: '3s',
      headers: {
        'User-Agent': `k6-${__VU}-${__ITER}`,
        'X-Forwarded-For': `10.${__VU}.${__ITER % 255}.1`,
      },
    }
  );

  const ok = check(res, {
    'click accepted or rejected cleanly': (r) =>
      r.status === 302 || r.status === 429,

    'no timeout': (r) => r.status !== 0,
    'no server error': (r) => r.status < 500,
  });

  if (!ok) {
    console.error(`BAD response: ${res.status}`);
  }

  // Optional small delay to reduce VU churn
  sleep(0.01);
}
