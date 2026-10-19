'use strict';

const assert = require('assert');
const { num, dayKey, parseTimestamp, mergeUsageMax, mergeLifetime, hourlyHistory } = require('../backend/metering-common');

assert.strictEqual(num(12), 12);
assert.strictEqual(num('3.5'), 3.5);
assert.strictEqual(num(0), 0);
assert.strictEqual(num(-1), 0);
assert.strictEqual(num(Number.NaN), 0);
assert.strictEqual(num(Number.POSITIVE_INFINITY), 0);

const sample = new Date(2026, 7, 9, 12, 0, 0).getTime();
assert.strictEqual(dayKey(sample), '2026-08-09');
assert.strictEqual(parseTimestamp(sample), sample);
assert.strictEqual(parseTimestamp(String(sample)), sample);
assert.strictEqual(parseTimestamp(new Date(sample).toISOString()), sample);
assert.deepStrictEqual(mergeUsageMax({ tokens: 10, msgs: 2 }, { tokens: 4, msgs: 1 }), { tokens: 10, msgs: 2 });
assert.deepStrictEqual(mergeUsageMax({ tokens: 10 }, { tokens: 12 }), { tokens: 12 });
assert.strictEqual(mergeLifetime({ tokens: 10, cost: 5 }, { tokens: 4, cost: 1 }).cost, 5);
assert.strictEqual(mergeLifetime({ tokens: 10, cost: 5 }, { tokens: 12, cost: 1 }).cost, 1);

const tokensByDay = { '2026-10-02': [1, 2, 3] }, costByDay = { '2026-10-02': [0.5], '2026-10-01': [0, 0.25] };
const hourly = hourlyHistory(tokensByDay, costByDay);
assert.deepStrictEqual(Object.keys(hourly).sort(), ['2026-10-01', '2026-10-02'], 'days from either map');
assert.strictEqual(hourly['2026-10-02'].tokens.length, 24);
assert.deepStrictEqual(hourly['2026-10-02'].tokens.slice(0, 4), [1, 2, 3, 0]);
assert.strictEqual(hourly['2026-10-01'].cost[1], 0.25);
hourly['2026-10-02'].tokens[0] = 99;
assert.strictEqual(tokensByDay['2026-10-02'][0], 1, 'hourly history is detached from ledger state');

console.log('metering common checks passed');
