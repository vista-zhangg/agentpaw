'use strict';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createWeeklyQuotaEstimator, cycleCost } = require('../backend/codex-quota-estimate');
const now = Date.parse('2026-09-16T10:24:00Z');
const start = Date.parse('2026-09-15T13:34:56Z');
const reset = (start + 604800000) / 1000;
const account = { type: 'chatgpt', email: 'test@example.com', planType: 'prolite' };
function state(used = 21, at = now, resetsAt = reset, acct = account) {
  return { status: 'ready', account: acct, updatedAt: at,
    windows: { weekly: { usedPercent: used, windowDurationMins: 10080, resetsAt, windowId: 'codex:10080' } } };
}
const rows = [
  { at: start - 1, cost: 999 },
  // Production regression: Astra requests carry Spark's latest rate snapshot.
  { at: start + 1000, cost: 30, limitId: 'codex_bengalfox', resetsAt: reset + 50000, usedPercent: 0 },
  { at: now - 1000, cost: 12, limitId: 'codex_bengalfox', resetsAt: reset + 50117, usedPercent: 0 },
  { at: now + 10000000, cost: 999 },
];
const usage = { quotaHistory: rows };
assert.strictEqual(cycleCost(rows, start, now), 42);
const estimator = createWeeklyQuotaEstimator();
let result = estimator.observe(usage, state(), now);
assert.strictEqual(result.estimatedTotalCost, 200, 'unrelated limit metadata must not discard real spend');
assert.strictEqual(result.estimatedRemainingCost, 158);
assert.strictEqual(result.basis, 'cycle');
assert(result.rangeLow < 200 && result.rangeHigh > 200);
// Neither an identical quota timestamp nor unchanged percentage freezes money.
const more = { quotaHistory: [...rows, { at: now, cost: 21 }] };
assert.strictEqual(estimator.observe(more, state(), now).estimatedTotalCost, 300);
assert.strictEqual(estimator.observe(more, state(21, now + 30000, reset + 60), now + 30000).estimatedTotalCost, 300,
  'deadline rounding/jitter is not a new cycle');
assert.strictEqual(estimator.observe(more, { status: 'connecting' }, now + 31000), null);
assert.strictEqual(estimator.observe(more, state(21, now + 16 * 60000), now + 16 * 60000).estimatedTotalCost, 300,
  'server recycling and long gaps do not clear calibration');
assert.strictEqual(estimator.observe(more, state(20, now + 17 * 60000), now + 17 * 60000).basis, 'cycle',
  'a one-point correction must not reset history');
assert.strictEqual(estimator.observe(more, state(21, now + 30000, reset + 86400), now + 30000), null,
  'out-of-order snapshots cannot switch the cycle');

const early = createWeeklyQuotaEstimator().observe({ quotaHistory: [{ at: now, cost: 1 }] }, state(1), now);
assert.strictEqual(early.estimatedTotalCost, 100, 'no arbitrary 5% display gate');
assert.strictEqual(early.confidence, 'early');
assert.strictEqual(early.rangeHigh, null);
const zero = createWeeklyQuotaEstimator().observe(usage, state(0), now);
assert.strictEqual(zero.cost, 42);
assert.strictEqual(zero.reason, 'no-percent');
assert.strictEqual(zero.estimatedTotalCost, null);
assert.strictEqual(createWeeklyQuotaEstimator().observe({ quotaHistory: [] }, state(), now).reason, 'no-cost');
assert.strictEqual(estimator.observe(usage, state(), now + 6 * 60000), null, 'stale quotas are not live forecasts');
assert.strictEqual(estimator.observe(usage, state(21, now, now / 1000 - 1), now), null);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentpaw-quota-'));
try {
  const statePath = path.join(root, 'calibration.json');
  let persistent = createWeeklyQuotaEstimator({ statePath });
  assert.strictEqual(persistent.observe(usage, state(), now).estimatedTotalCost, 200);
  assert(!fs.readFileSync(statePath, 'utf8').includes(account.email), 'persist hashed identity only');
  persistent = createWeeklyQuotaEstimator({ statePath });
  assert.strictEqual(persistent.observe(usage, state(21, now + 1000), now + 1000).estimatedTotalCost, 200);
  // Manual reset without a changed deadline: old 42 dollars must be excluded.
  result = persistent.observe(usage, state(0, now + 2000), now + 2000);
  assert.strictEqual(result.basis, 'sample');
  assert.strictEqual(result.estimatedTotalCost, null);
  persistent = createWeeklyQuotaEstimator({ statePath });
  const afterReset = { quotaHistory: [...rows, { at: now + 2500, cost: 1 }] };
  result = persistent.observe(afterReset, state(1, now + 3000), now + 3000);
  assert.strictEqual(result.estimatedTotalCost, 100, 'restart preserves a manual reset boundary');
  result = persistent.observe(afterReset, state(1, now + 4000, reset, { ...account, email: 'other@example.com' }), now + 4000);
  assert.strictEqual(result.estimatedTotalCost, null, 'account switches cannot borrow historical spending');
  result = persistent.observe({ quotaHistory: [...afterReset.quotaHistory, { at: now + 4500, cost: 2 }] },
    state(2, now + 5000, reset, { ...account, email: 'other@example.com' }), now + 5000);
  assert.strictEqual(result.estimatedTotalCost, 200);
  // Corrupt cache must be recoverable, never an indefinite collecting state.
  fs.writeFileSync(statePath, '{broken');
  assert.strictEqual(createWeeklyQuotaEstimator({ statePath }).observe(usage, state(), now).estimatedTotalCost, 200);
} finally { fs.rmSync(root, { recursive: true, force: true }); }
const exhausted = createWeeklyQuotaEstimator();
assert.strictEqual(exhausted.observe(usage, state(100), now).estimatedTotalCost, 42);
assert.strictEqual(exhausted.observe(more, state(100, now + 1000), now + 1000).estimatedTotalCost, 42);
assert.strictEqual(exhausted.observe(more, state(100, now + 2000), now + 2000).estimatedRemainingCost, 0);
console.log('codex quota estimate checks passed');

// Forecast: when each window runs out at the recent burn rate.
const { createQuotaForecaster } = require('../backend/codex-quota-forecast');
const H = 3600e3;
const t0 = Date.parse('2026-10-19T12:00:00Z');
const fiveReset = (t0 + 2 * H) / 1000, weekReset = (t0 + 80 * H) / 1000;
const live = (fiveUsed, weekUsed, at) => ({ status: 'ready', updatedAt: at, windows: {
  fiveHour: { windowId: 'codex:300', usedPercent: fiveUsed, resetsAt: fiveReset },
  weekly: { windowId: 'codex:10080', usedPercent: weekUsed, resetsAt: weekReset },
} });
const forecaster = createQuotaForecaster();
let f = forecaster.observe(live(40, 30, t0), [], t0);
assert.strictEqual(f.fiveHour.status, 'collecting', 'one sample is not a rate');
f = forecaster.observe(live(46, 30, t0 + 10 * 60e3), [], t0 + 10 * 60e3);
assert.strictEqual(f.fiveHour.status, 'collecting', 'too short a span is not a rate');
f = forecaster.observe(live(52, 30, t0 + 30 * 60e3), [], t0 + 30 * 60e3);
assert.strictEqual(f.fiveHour.status, 'ready');
assert(Math.abs(f.fiveHour.ratePerHour - 24) < 1e-9, '12 points in 30 minutes');
// 48% left at 24%/h = 2h; reset is 1.5h away, so it is enough.
assert.strictEqual(f.fiveHour.exhaustAt, null);
assert(Math.abs(f.fiveHour.remainingAtReset - 12) < 1e-9);
f = forecaster.observe(live(70, 30, t0 + 60 * 60e3), [], t0 + 60 * 60e3);
// 30 points in the last hour; 30% left lasts 1h, reset is 1h away: boundary is enough.
assert.strictEqual(f.fiveHour.exhaustAt, null);
f = forecaster.observe(live(80, 30, t0 + 70 * 60e3), [], t0 + 70 * 60e3);
// last hour: 46 -> 80 = 34 points in 60 min; 20% left runs out in ~35 min, reset in 50 min.
assert(f.fiveHour.exhaustAt > t0 + 70 * 60e3 && f.fiveHour.exhaustAt < fiveReset * 1000, 'runs out before reset');
assert(f.fiveHour.earlyMs > 0 && f.fiveHour.remainingAtReset === 0);
assert.strictEqual(f.weekly.status, 'collecting', 'flat live weekly needs a longer span');
// Weekly samples come from transcript history; other limit buckets are ignored.
const history = [
  { at: t0 - 6 * H, usedPercent: 20, resetsAt: weekReset, limitId: 'codex' },
  { at: t0 - 3 * H, usedPercent: 26, resetsAt: weekReset, limitId: 'codex' },
  { at: t0 - 3 * H, usedPercent: 90, resetsAt: weekReset, limitId: 'spark' },
  { at: t0 - 2 * H, usedPercent: 5, resetsAt: weekReset - 7 * 24 * 3600, limitId: 'codex' },
];
const weekly = createQuotaForecaster().observe(live(10, 32, t0), history, t0).weekly;
assert.strictEqual(weekly.status, 'ready');
assert(Math.abs(weekly.ratePerHour - 2) < 1e-9, '12 points over 6 hours from the same cycle only');
assert(Math.abs(weekly.exhaustAt - (t0 + 34 * H)) < 1000, '68% left at 2%/h runs out in 34h, before the 80h reset');
assert(Math.abs(weekly.earlyMs - 46 * H) < 1000);
assert.deepStrictEqual(createQuotaForecaster().observe({ status: 'error', windows: {} }, history, t0), {}, 'no live window, no forecast');
console.log('codex quota forecast checks passed');

