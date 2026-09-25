// Shared by the k6 scenarios. k6 runs JavaScript in its own runtime (not Node): `k6/*` imports and
// __ENV come from k6 itself.
import http from 'k6/http';
import { Counter, Trend } from 'k6/metrics';

export const BASE_URL = __ENV.BASE_URL || 'http://nginx:8080';
const JSON_HEADERS = { 'Content-Type': 'application/json' };

// In a sale, "sold out", "already bought" and "not open" are correct answers, not errors. Without
// this, k6's http_req_failed would count every 410 as a failure. 429 and 5xx still count.
http.setResponseCallback(http.expectedStatuses(200, 201, 403, 409, 410));

/**
 * One counter per answer the purchase endpoint can give. The thresholds in each scenario are the
 * tests: "exactly 100 x 201, zero 5xx". k6 fails the run (exit code 99) when one does not hold.
 */
const buyCounters = {
  201: new Counter('buy_201'),
  403: new Counter('buy_403'),
  409: new Counter('buy_409'),
  410: new Counter('buy_410'),
  429: new Counter('buy_429'),
  '5xx': new Counter('buy_5xx'),
  other: new Counter('buy_other'), // anything else, including a network error (status 0)
};
export const loginFailed = new Counter('login_failed');
// Time of the buy request alone, login excluded. Its p95 goes into docs/stress-results.md.
export const buyDuration = new Trend('buy_duration', true);

/** Adds 1 to the counter for this answer and 0 to the rest, so every counter exists in the summary. */
export function countBuy(res) {
  const key = res.status >= 500 ? '5xx' : buyCounters[res.status] ? res.status : 'other';
  for (const [name, counter] of Object.entries(buyCounters)) {
    counter.add(name === String(key) ? 1 : 0);
  }
  buyDuration.add(res.timings.duration);
}

/**
 * Puts the sale back to a clean start (POST /api/admin/reset, needs ENABLE_ADMIN and ADMIN_TOKEN).
 * Called once from setup(). A failed reset stops the run: numbers from a dirty sale mean nothing.
 */
export function resetSale(body) {
  const res = http.post(`${BASE_URL}/api/admin/reset`, JSON.stringify(body), {
    headers: { ...JSON_HEADERS, 'X-Admin-Token': __ENV.ADMIN_TOKEN },
  });
  if (res.status !== 200) {
    throw new Error(`Reset failed (${res.status}): ${res.body}. Did you run npm run stress:up?`);
  }
  return res.json();
}

/** Demo login. Returns the token, or null (counted in login_failed, which must stay 0). */
export function login(userId) {
  const res = http.post(`${BASE_URL}/api/auth/demo-login`, JSON.stringify({ userId }), {
    headers: JSON_HEADERS,
    tags: { name: 'login' },
  });
  if (res.status !== 200) {
    loginFailed.add(1);
    return null;
  }
  loginFailed.add(0);
  return res.json('accessToken');
}

/** The purchase request as [method, url, body, params], ready for http.post or http.batch. */
export function buyRequest(token) {
  return [
    'POST',
    `${BASE_URL}/api/purchases`,
    null,
    { headers: { Authorization: `Bearer ${token}` }, tags: { name: 'buy' } },
  ];
}

export function buy(token) {
  const [, url, body, params] = buyRequest(token);
  const res = http.post(url, body, params);
  countBuy(res);
  return res;
}
