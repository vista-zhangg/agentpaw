'use strict';

// Guards when AgentPaw may make a sound or send a system notification: a
// missed "needs you" stalls an agent, and a noisy one gets switched off.

const assert = require('assert');
const { createAlerts, SOUND_GAP_MS, TOAST_GAP_MS } = require('../backend/alerts');
const workflow = require('../shared/workflow-preferences');

function setup(prefs = {}, surface = {}) {
  const state = { time: 1000000, sounds: [], toasts: [], prefs: workflow.notifications(prefs),
    surface: { visible: true, quiet: false, fullscreen: false, locked: false, ...surface }, privacy: false };
  const alerts = createAlerts({
    getPreferences: () => state.prefs,
    getSurface: () => state.surface,
    isPrivate: () => state.privacy,
    playSound: tone => state.sounds.push(tone),
    showToast: (toast, event) => state.toasts.push({ ...toast, event }),
    describe: (event, isPrivate) => ({ title: isPrivate ? 'private' : event.kind, body: '' }),
    now: () => state.time,
  });
  return { state, alerts };
}
const waiting = { kind: 'waiting', sessionId: 's1' };
const reply = { kind: 'needsinput', sessionId: 's1' };
const failed = { kind: 'error', sessionId: 's1' };
const done = { kind: 'completion-summary', count: 1 };

{
  const defaults = workflow.notifications();
  assert.deepStrictEqual([defaults.sound, defaults.systemNotifications, defaults.alertOnDone], [true, true, false], 'alerts start restrained');
  const upgraded = workflow.notifications({ mode: 'attention' });
  assert.strictEqual(upgraded.sound, true, 'settings saved by older versions keep working');
  const off = workflow.notifications({ sound: false, systemNotifications: false, alertOnDone: true });
  assert.deepStrictEqual([off.sound, off.systemNotifications, off.alertOnDone], [false, false, true], 'switches persist');
}
{
  const { state, alerts } = setup();
  alerts.handle(waiting);
  assert.deepStrictEqual(state.sounds, ['attention'], 'a visible companion still chimes');
  assert.strictEqual(state.toasts.length, 0, 'a visible companion needs no system notification');
}
{
  const { state, alerts } = setup({}, { visible: false });
  alerts.handle(waiting);
  assert.deepStrictEqual(state.sounds, ['attention']);
  assert.strictEqual(state.toasts.length, 1, 'a hidden window falls back to a system notification');
  assert.strictEqual(state.toasts[0].event, waiting, 'the notification keeps its event for the click');
}
for (const event of [waiting, reply, failed]) {
  const { state, alerts } = setup({}, { visible: false });
  alerts.handle(event);
  assert.strictEqual(state.toasts.length, 1, `${event.kind} reaches the user`);
}
{
  const { state, alerts } = setup({ sound: false }, { visible: false });
  alerts.handle(waiting);
  assert.deepStrictEqual(state.sounds, [], 'sound switch turns the sound off');
  assert.strictEqual(state.toasts.length, 1);
}
{
  const { state, alerts } = setup({ systemNotifications: false }, { visible: false });
  alerts.handle(waiting);
  assert.strictEqual(state.toasts.length, 0, 'notification switch turns notifications off');
  assert.deepStrictEqual(state.sounds, ['attention']);
}
{
  const { state, alerts } = setup({}, { visible: false });
  alerts.handle(done);
  assert.deepStrictEqual([state.sounds, state.toasts], [[], []], 'completions stay silent by default');
  state.prefs = workflow.notifications({ alertOnDone: true });
  alerts.handle(done);
  assert.deepStrictEqual(state.sounds, ['done'], 'completions use their own softer tone');
  assert.strictEqual(state.toasts.length, 1);
}
{
  const { state, alerts } = setup({ alertOnDone: true }, { visible: false, quiet: true });
  alerts.handle(waiting); alerts.handle(done);
  assert.deepStrictEqual([state.sounds, state.toasts], [[], []], 'quiet time is quiet');
}
{
  const { state, alerts } = setup({}, { visible: false, fullscreen: true });
  alerts.handle(waiting);
  assert.deepStrictEqual(state.sounds, [], 'full screen never plays a sound');
  assert.strictEqual(state.toasts.length, 1);
}
{
  const { state, alerts } = setup({}, { visible: false, locked: true });
  alerts.handle(waiting);
  assert.deepStrictEqual(state.sounds, [], 'a locked desktop stays silent');
}
{
  const { state, alerts } = setup({}, { visible: false });
  alerts.handle(waiting); alerts.handle(reply); alerts.handle(waiting);
  assert.strictEqual(state.sounds.length, 1, 'bursts share one sound');
  assert.strictEqual(state.toasts.length, 2, 'one notification per kind and session');
  state.time += SOUND_GAP_MS;
  alerts.handle(waiting);
  assert.strictEqual(state.sounds.length, 2, 'sound returns after the gap');
  assert.strictEqual(state.toasts.length, 2);
  alerts.handle({ ...waiting, sessionId: 's2' });
  assert.strictEqual(state.toasts.length, 3, 'another session is another notification');
  state.time += TOAST_GAP_MS;
  alerts.handle(waiting);
  assert.strictEqual(state.toasts.length, 4, 'a request still waiting can notify again');
}
{
  const { state, alerts } = setup({}, { visible: false });
  state.privacy = true;
  alerts.handle(waiting);
  assert.strictEqual(state.toasts[0].title, 'private', 'privacy mode reaches the notification text');
}
{
  const { state, alerts } = setup({}, { visible: false });
  for (const event of [{ kind: 'operation' }, { kind: 'say' }, { kind: 'user-turn' }, { kind: 'quota-alert' }, { ...waiting, silent: true }, null]) alerts.handle(event);
  assert.deepStrictEqual([state.sounds, state.toasts], [[], []], 'routine events never alert');
}

console.log('alert sound and notification checks passed');
