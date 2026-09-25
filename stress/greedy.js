// Greedy users: 500 users each fire 20 purchase requests in parallel.
// Proves rule 2 (one unit per user) under a race: no user ever gets more than one 201. With 100
// units, exactly 100 users win once; every other request is 409 (already bought) or 410 (sold out).
//
//   npm run stress:greedy      then      npm run verify
import http from 'k6/http';
import exec from 'k6/execution';
import { Counter } from 'k6/metrics';
import { buyRequest, countBuy, login, resetSale } from './lib.js';

const USERS = 500;
const PARALLEL = 20;
const STOCK = 100;

// Users who got more than one 201. Any value above 0 is a broken rule 2.
const usersWithTwoWins = new Counter('users_with_two_wins');

export const options = {
  scenarios: {
    greedy: { executor: 'per-vu-iterations', vus: USERS, iterations: 1, maxDuration: '5m' },
  },
  // k6 sends at most 6 requests of a batch at a time to one host by default. 20 lets every request
  // of a user's batch be in flight together.
  batchPerHost: PARALLEL,
  thresholds: {
    buy_201: [`count==${STOCK}`],
    users_with_two_wins: ['count==0'],
    buy_5xx: ['count==0'],
    buy_403: ['count==0'],
    buy_429: ['count==0'],
    buy_other: ['count==0'],
    login_failed: ['count==0'],
  },
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
};

export function setup() {
  return resetSale({ stock: STOCK, startsInSeconds: -1, durationSeconds: 3600 });
}

export default function () {
  const token = login(`greedy-${exec.vu.idInTest}`);
  if (!token) return;
  const responses = http.batch(Array.from({ length: PARALLEL }, () => buyRequest(token)));
  responses.forEach(countBuy);
  const wins = responses.filter((r) => r.status === 201).length;
  usersWithTwoWins.add(wins > 1 ? 1 : 0);
}
