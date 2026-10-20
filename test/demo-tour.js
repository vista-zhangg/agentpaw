'use strict';

// "Play a demo": scripted turn over real stats, answered only by the demo card.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createDemoTour, DEMO_PREFIX, APPROVAL_TIMEOUT_MS } = require('../backend/demo-tour');

let clock = 0;
let timers = [];
const later = (fn, ms) => { const id = { fn, at: clock + ms }; timers.push(id); return id; };
const cancel = (id) => { timers = timers.filter((x) => x !== id); };
function advance(ms) {
  const until = clock + ms;
  for (;;) {
    const next = timers.filter((x) => x.at <= until).sort((a, b) => a.at - b.at)[0];
    if (!next) break;
    clock = next.at;
    timers = timers.filter((x) => x !== next);
    next.fn();
  }
  clock = until;
}

const events = [];
let emits = 0;
const tour = createDemoTour({
  text: (s) => s, t: (k) => k, now: () => clock,
  setTimeout: later, clearTimeout: cancel,
  emitStats: () => { emits++; }, sendEvent: (ev) => events.push(ev),
});
const real = { sessions: [{ sessionId: 'real', state: 'idle' }], actions: [], workingCount: 0, waitingCount: 0,
  thinkingCount: 0, idleMs: 900000, today: { cost: 1.5 } };

assert.strictEqual(tour.overlay(real), real, 'no overlay while idle');
assert.strictEqual(tour.decide('real-permission', 'allow'), false, 'real requests are not the demo\'s');
assert.strictEqual(tour.start(), true);
assert.strictEqual(tour.start(), false, 'one demo at a time');
let view = tour.overlay(real);
assert.deepStrictEqual(view.sessions.map((s) => [s.sessionId.startsWith(DEMO_PREFIX), s.state]), [[true, 'thinking']]);
assert.strictEqual(view.thinkingCount, 1);
assert.strictEqual(view.today.cost, 1.5, 'usage numbers stay real');
assert.strictEqual(real.sessions[0].sessionId, 'real', 'the real stats object is not mutated');
assert.strictEqual(events[0].kind, 'user-turn');

advance(2400);
assert.strictEqual(tour.overlay(real).workingCount, 1);
assert.strictEqual(events.at(-1).kind, 'operation');

advance(2800);
view = tour.overlay(real);
assert.strictEqual(view.waitingCount, 1);
const choice = view.actions[0].choice;
assert(choice.permId.startsWith(DEMO_PREFIX) && choice.options.map((o) => o.key).join() === 'allow,deny');
assert.strictEqual(events.at(-1).kind, 'waiting');

// The card's answer moves the demo on and is swallowed.
assert.strictEqual(tour.decide(choice.permId, 'deny'), true);
view = tour.overlay(real);
assert.strictEqual(view.waitingCount, 0);
assert.strictEqual(view.workingCount, 1);
advance(2600);
assert.strictEqual(tour.overlay(real).sessions[0].badge, 'done');
assert.strictEqual(events.at(-1).kind, 'completion-summary');
advance(2600);
assert.strictEqual(events.at(-1).kind, 'say');
advance(5000);
assert.strictEqual(tour.active(), false, 'the demo ends by itself');
assert.strictEqual(tour.overlay(real), real);
assert(emits > 4);

// Unanswered approval continues on its own; quiet stop leaves stats to the caller.
tour.start();
advance(5200 + APPROVAL_TIMEOUT_MS);
assert.strictEqual(tour.overlay(real).workingCount, 1, 'an unanswered card times out');
const before = emits;
assert.strictEqual(tour.stop({ quiet: true }), true);
assert.strictEqual(emits, before);
advance(60000);
assert.strictEqual(events.filter((e) => e.kind === 'say').length, 1, 'no step runs after stop');

// main.js: a real request stops the demo, and demo answers never reach permissions.
const main = fs.readFileSync(path.join(__dirname, '..', 'main.js'), 'utf8');
assert(/stats\.waitingCount > 0 \|\| stats\.needsinputCount > 0\) demoTour\.stop\(\{ quiet: true \}\)/.test(main));
assert(main.indexOf('demoTour.decide(permId, behavior)') < main.indexOf('permissions.decide(permId, behavior)'));
assert(/taskNotifications && !\(demoTour && demoTour\.active\(\)\)/.test(main), 'the demo sends no system notifications');

console.log('demo tour: script, demo-only answers, timeout and real-request precedence checks passed');
