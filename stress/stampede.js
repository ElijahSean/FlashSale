// Stampede: 10,000 different users go for 100 units at once.
// Proves rule 1 (never oversell) with two API copies: exactly 100 get 201,
// the rest get 410 SOLD_OUT, and nobody gets a 5xx.
//
//   npm run stress:stampede      then      npm run verify
import exec from 'k6/execution';
import { buy, login, resetSale } from './lib.js';

const USERS = 10_000;
const STOCK = 100;

export const options = {
  scenarios: {
    stampede: {
      // 500 virtual users share 10,000 runs. Each run is a new user who logs in and buys once.
      // Login happens per run, not in setup(): k6 copies setup data to every virtual user,
      // and 10,000 tokens x 500 users would need about 1 GB.
      executor: 'shared-iterations',
      vus: 500,
      iterations: USERS,
      maxDuration: '5m',
    },
  },
  thresholds: {
    buy_201: [`count==${STOCK}`],
    buy_410: [`count==${USERS - STOCK}`],
    buy_5xx: ['count==0'],
    buy_403: ['count==0'],
    buy_409: ['count==0'],
    buy_429: ['count==0'],
    buy_other: ['count==0'],
    login_failed: ['count==0'],
  },
  summaryTrendStats: ['avg', 'med', 'p(95)', 'p(99)', 'max'],
};

// Sale open now, for an hour, whatever .env says.
export function setup() {
  return resetSale({ stock: STOCK, startsInSeconds: -1, durationSeconds: 3600 });
}

export default function () {
  // iterationInTest is unique, so we get 10,000 different users.
  const token = login(`stampede-${exec.scenario.iterationInTest}`);
  if (token) buy(token);
}
