// Failover: stop one API replica in the middle of steady traffic. No purchase may fail.
//
//   npm run stress:failover
//   about 10 s in, in a second terminal:   docker compose stop api1
//   when it ends:                          npm run verify   then   docker compose start api1
//
// Why nothing fails (see apps/web/nginx.conf and OrderQueue.onApplicationShutdown):
// - docker stop sends SIGTERM. The replica stops accepting, finishes the requests it already has,
//   and only then closes its queue and database connections.
// - nginx sees the refused (or, once the container is gone, timed-out) connection and sends the
//   request to the other replica. It retries only requests that were never sent, so no purchase
//   is sent twice. A request that meets the stopped replica is slower (up to 3 s), not failed.
import exec from 'k6/execution';
import { buy, login, resetSale } from './lib.js';

// Enough stock for everyone, so every answer should be 201.
const STOCK = 100_000;

export const options = {
  scenarios: {
    steady: {
      // A steady 50 new buyers per second for 30 s, whatever the response times: a stopped
      // replica cannot slow the load down and hide failures.
      executor: 'constant-arrival-rate',
      rate: 50,
      timeUnit: '1s',
      duration: '30s',
      preAllocatedVUs: 50,
      maxVUs: 200,
    },
  },
  thresholds: {
    buy_201: ['count>0'],
    buy_5xx: ['count==0'],
    buy_other: ['count==0'],
    buy_403: ['count==0'],
    buy_409: ['count==0'],
    buy_410: ['count==0'],
    buy_429: ['count==0'],
    login_failed: ['count==0'],
  },
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
};

export function setup() {
  return resetSale({ stock: STOCK, startsInSeconds: -1, durationSeconds: 3600 });
}

export default function () {
  const token = login(`failover-${exec.scenario.iterationInTest}`);
  if (token) buy(token);
}
