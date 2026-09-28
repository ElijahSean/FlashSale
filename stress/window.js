// Window edges: buying before the sale opens and after it closes.
// Proves the sale window holds under load (rule 9): before the start every buy gets
// 403 NOT_STARTED, after the end 403 ENDED, and no unit moves.
// The exact millisecond edges are tested in the Lua tests.
//
//   npm run stress:window      then      npm run verify   (expects 0 buyers, 0 orders)
//
// Timeline, in seconds after setup() resets the sale:
//   0 to 15   "before": 1,000 users try to buy       window opens at 20
//   20 to 30  sale open, no traffic                   window closes at 30
//   35 to 50  "after": 1,000 users try to buy
import exec from 'k6/execution';
import { Counter } from 'k6/metrics';
import { buy, login, resetSale } from './lib.js';

const USERS_PER_PHASE = 1000;

// Any answer that isn't the expected 403. Must stay 0.
const wrongAnswers = new Counter('window_wrong_answers');
const beforeChecked = new Counter('window_before_checked');
const afterChecked = new Counter('window_after_checked');

const phase = (fn, startTime) => ({
  executor: 'shared-iterations',
  vus: 100,
  iterations: USERS_PER_PHASE,
  maxDuration: '15s',
  startTime,
  exec: fn,
});

export const options = {
  scenarios: {
    before: phase('before', '0s'),
    after: phase('after', '35s'),
  },
  thresholds: {
    window_wrong_answers: ['count==0'],
    // Every planned try ran. Fewer means a phase ran out of time.
    window_before_checked: [`count==${USERS_PER_PHASE}`],
    window_after_checked: [`count==${USERS_PER_PHASE}`],
    buy_201: ['count==0'],
    buy_5xx: ['count==0'],
    login_failed: ['count==0'],
  },
};

// The sale opens 20 s after the reset (Redis clock) and lasts 10 s.
export function setup() {
  return resetSale({ stock: 100, startsInSeconds: 20, durationSeconds: 10 });
}

function attempt(prefix, expected, checked) {
  const token = login(`${prefix}-${exec.scenario.iterationInScenario}`);
  if (!token) return;
  const res = buy(token);
  const ok = res.status === 403 && res.json('result') === expected;
  wrongAnswers.add(ok ? 0 : 1);
  checked.add(1);
}

export function before() {
  attempt('before', 'NOT_STARTED', beforeChecked);
}

export function after() {
  attempt('after', 'ENDED', afterChecked);
}
