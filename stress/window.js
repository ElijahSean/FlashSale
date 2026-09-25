// Window edges: buying before the sale opens and after it closes.
// Proves the sale window holds under load (rule 9: the gate uses Redis TIME): every attempt
// before the start gets 403 NOT_STARTED, every attempt after the end gets 403 ENDED, and not one
// unit moves. The exact millisecond edges are covered by the Lua tests in 03.
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

// Answers that were not the expected 403 with the expected result. Must stay 0.
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
    // Every planned attempt ran; fewer would mean a phase ran out of time.
    window_before_checked: [`count==${USERS_PER_PHASE}`],
    window_after_checked: [`count==${USERS_PER_PHASE}`],
    buy_201: ['count==0'],
    buy_5xx: ['count==0'],
    login_failed: ['count==0'],
  },
};

// The window starts 20 s after the reset, by the Redis clock, and lasts 10 s.
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
