'use strict';

// Quick view: recent history is acknowledged only when the user expands it,
// failures stay visible, and session tools never resolve pending work.
const assert = require('assert');
const vm = require('vm');
const { loadRenderer } = require('./dom-stub');

const world = loadRenderer(['shared/i18n.js', 'shared/states.js', 'shared/pet-assets.js',
  'shared/pet-insights.js', 'renderer/pet.js', 'renderer/quick-view.js']);
const { sandbox, window, elements, handlers } = world;
const requests = [];
let fail = false;
let complete;
let stats;
const row = id => ({ id, at: Date.now(), kind: 'done', project: id, agent: 'codex', focusable: true, read: false });
const snapshot = (recent, extra = {}) => ({
  sessions: [], recent, waitingCount: 0, needsinputCount: 0, today: { tokens: 1200, cost: 0.5, messages: 2 }, ...extra,
});
const push = value => { stats = value; handlers.stats(value); };
window.pet.markRecentRead = ids => {
  requests.push(Array.from(ids));
  return new Promise(resolve => {
    complete = () => {
      if (!fail) push({ ...stats, recent: stats.recent.map(item => ids.includes(item.id) ? { ...item, read: true } : item) });
      resolve({ ok: !fail });
    };
  });
};
let focused = 0, cleared = 0;
const prefs = [];
window.pet.focusRecent = async () => { focused++; return true; };
window.pet.clearRecent = async () => { cleared++; return { ok: true }; };
window.pet.updateSessionPreferences = async (id, value) => { prefs.push([id, value]); return { ok: true }; };
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };
const open = () => vm.runInContext('openActionPop()', sandbox);
const close = () => vm.runInContext('closeActionPop()', sandbox);
const isOpen = () => vm.runInContext('actionPopOpen', sandbox);
const toggle = () => elements('ac-recent-toggle').dispatch('click');
const find = (el, className) => {
  if (!el) return null;
  if (el.classList && el.classList.contains(className)) return el;
  for (const child of el.children || []) { const hit = find(child, className); if (hit) return hit; }
  return null;
};

(async () => {
  push(snapshot([row('a')]));
  await flush();
  assert.equal(requests.length, 0, 'hidden rendering never reads history');
  open();
  await flush();
  assert.equal(requests.length, 0, 'opening the quick view keeps history collapsed and unread');
  assert(find(elements('ac-recent-toggle'), 'new').textContent.includes('1'), 'the collapsed row shows unread records');
  toggle();
  await flush();
  assert.deepEqual(requests, [['a']], 'expanding history acknowledges the visible records once');
  push(snapshot([row('b'), row('a')]));
  await flush();
  assert.equal(requests.length, 1, 'new arrivals do not trigger automatic reads');
  complete(); await flush();
  assert.equal(stats.recent[0].read, false, 'in-flight acknowledgement excludes later records');
  assert.equal(stats.recent[1].read, true);
  toggle(); toggle(); await flush();
  assert.deepEqual(requests[1], ['b'], 'expanding again acknowledges newer records');
  complete(); await flush();
  close();

  push(snapshot([row('c')], { waitingCount: 1 }));
  open(); await flush();
  assert.equal(elements('ac-act-sec').hidden, false, 'pending work is shown first');
  assert.equal(elements('qv-need-count').textContent, '1');
  toggle(); await flush(); complete(); await flush();
  assert.equal(stats.waitingCount, 1, 'reading history never resolves pending work');
  close();

  push(snapshot([row('d')]));
  open(); toggle(); close(); await flush();
  assert.equal(requests.length, 3, 'closing before acknowledgement cancels it');
  open(); toggle(); await flush();
  fail = true; complete(); await flush();
  assert.equal(stats.recent[0].read, false, 'failed persistence preserves unread state');
  assert(elements('ac-status').textContent.includes('保存失败'));
  toggle(); toggle(); await flush();
  fail = false; complete(); await flush();
  assert.equal(stats.recent[0].read, true, 're-expanding retries failed persistence');
  assert.equal(elements('ac-status').textContent, '', 'successful retry clears its error');

  // History rows open their session; clearing stays available.
  push(snapshot([row('e')]));
  await flush();
  const ev = elements('ac-recent-list').children[0];
  assert.equal(find(ev, 'name').textContent, 'e');
  ev.dispatch('click'); await flush();
  assert.equal(focused, 1); assert.equal(isOpen(), false);
  complete(); await flush();
  elements('ac-clear-recent').dispatch('click'); await flush();
  assert.equal(cleared, 1, 'clear remains available');

  // Session tools: follow and rename/mute without opening the session.
  push(snapshot([], { workingCount: 1, sessions: [{ sessionId: 's1', agent: 'claude', project: 'p', state: 'working', model: 'sonnet' }] }));
  open(); await flush();
  const sess = elements('ac-session-list').children[0];
  const tools = find(sess, 'row-tools');
  tools.children[0].dispatch('click'); await flush();
  assert.deepEqual(prefs[0], ['s1', { pinned: true }], 'the star follows a session');
  tools.children[1].dispatch('click');
  const editor = elements('ac-session-list').children[1];
  assert(editor.classList.contains('sess-editor'), 'the pencil opens the inline editor below the row');
  assert.equal(isOpen(), true, 'session tools keep the quick view open');
  assert(!world.calls.some(([name]) => name === 'focusSession'), 'tools never open the session');

  // Workflow shortcuts: "peek" toggles, "actions" opens.
  let command;
  window.pet.onWorkflowCommand = handler => { command = handler; };
  vm.runInContext(require('fs').readFileSync(require('path').join(__dirname, '../renderer/quick-view.js'), 'utf8'), sandbox);
  close();
  command('peek'); assert.equal(isOpen(), true, 'shortcut opens the quick view');
  command('peek'); assert.equal(isOpen(), false, 'shortcut closes it again');
  command('actions'); assert.equal(isOpen(), true, 'next-task shortcut opens the quick view');
  console.log('Quick view history, session tools and shortcut checks passed');
  process.exit(0); // pet.js keeps animation and refresh timers alive.
})().catch(error => { console.error(error); process.exit(1); });
