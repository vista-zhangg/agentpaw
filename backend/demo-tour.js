'use strict';

// "Play a demo": a short scripted turn so a new user sees what AgentPaw does
// without a real AI task. Demo sessions are laid over the stats after the task
// center has run, so nothing is recorded, notified or sent to an agent, and the
// approval card's answer only moves the demo along.

const DEMO_PREFIX = 'agentpaw-demo-';
const SESSION_ID = DEMO_PREFIX + 'session';
const PERM_ID = DEMO_PREFIX + 'permission';
const APPROVAL_TIMEOUT_MS = 9000;

const COUNT_FOR = {
  working: 'workingCount', juggling: 'jugglingCount', sweeping: 'sweepingCount',
  thinking: 'thinkingCount', loafing: 'loafingCount', error: 'errorCount',
};

function createDemoTour(deps) {
  const text = deps.text;
  const t = deps.t;
  const now = deps.now || Date.now;
  const later = deps.setTimeout || setTimeout;
  const cancel = deps.clearTimeout || clearTimeout;
  let running = false;
  let session = null;
  let actions = [];
  let timers = [];
  let waitingForApproval = false;

  const project = () => deps.project || text('AgentPaw 演示');

  function setSession(state, patch = {}) {
    session = {
      sessionId: SESSION_ID, id: SESSION_ID, agent: 'claude', project: project(), projectKey: SESSION_ID,
      model: 'claude-sonnet', state, badge: null, op: '', reason: null, choice: null,
      createdAt: session ? session.createdAt : now(), turnStartedAt: session ? session.turnStartedAt : now(),
      updatedAt: now(), contextPercent: 24, focusable: false, demo: true, ...patch,
    };
    deps.emitStats();
  }

  function at(ms, fn) {
    const id = later(() => { timers = timers.filter((x) => x !== id); if (running) fn(); }, ms);
    timers.push(id);
  }

  function clearTimers() {
    for (const id of timers) cancel(id);
    timers = [];
  }

  function askApproval() {
    const choice = {
      kind: 'perm', sessionId: SESSION_ID, agent: 'claude', permId: PERM_ID, actionId: PERM_ID,
      project: project(), header: 'Bash', question: text('运行命令：npm test'),
      options: [{ label: t('perm.allow'), key: 'allow' }, { label: t('perm.deny'), key: 'deny' }],
      multi: false, allowInput: false, demo: true,
    };
    actions = [{ id: PERM_ID, actionId: PERM_ID, sessionId: SESSION_ID, state: 'waiting', reason: 'perm', choice }];
    waitingForApproval = true;
    setSession('waiting', { reason: 'perm', choice });
    deps.sendEvent({ kind: 'waiting', project: project(), reason: 'perm', choice });
    at(APPROVAL_TIMEOUT_MS, () => resume('allow'));
  }

  function resume(behavior) {
    if (!waitingForApproval) return;
    waitingForApproval = false;
    clearTimers();
    actions = [];
    const allowed = behavior !== 'deny';
    setSession('working', { op: allowed ? text('运行 npm test') : text('换一种做法') });
    deps.sendEvent({ kind: 'operation', tool: allowed ? 'Bash' : 'Edit', icon: allowed ? '▶' : '✎',
      detail: allowed ? text('测试通过') : text('修改 src/app.js'), project: project() });
    at(2600, () => {
      setSession('idle', { badge: 'done', op: '' });
      deps.sendEvent({ kind: 'completion-summary', count: 1, project: project() });
    });
    at(5200, () => deps.sendEvent({ kind: 'say', text: text('演示结束。真实任务需要你时，我也会这样提醒你。') }));
    at(9500, () => stop());
  }

  function start() {
    if (running) return false;
    running = true;
    session = null;
    actions = [];
    setSession('thinking');
    deps.sendEvent({ kind: 'user-turn', project: project() });
    at(2400, () => {
      setSession('working', { op: text('修改 src/app.js') });
      deps.sendEvent({ kind: 'operation', tool: 'Edit', icon: '✎', detail: text('修改 src/app.js'), project: project() });
    });
    at(5200, askApproval);
    return true;
  }

  // `quiet` when the caller is already rebuilding the stats.
  function stop({ quiet = false } = {}) {
    if (!running) return false;
    running = false;
    waitingForApproval = false;
    clearTimers();
    session = null;
    actions = [];
    if (!quiet) deps.emitStats();
    return true;
  }

  // Answers from the demo card never reach the permission queue.
  function decide(permId, behavior) {
    if (typeof permId !== 'string' || !permId.startsWith(DEMO_PREFIX)) return false;
    if (running) resume(behavior);
    return true;
  }

  function overlay(stats) {
    if (!running || !session || !stats) return stats;
    const out = { ...stats, sessions: [session], actions: actions.slice(), idleMs: 0 };
    for (const key of [...Object.values(COUNT_FOR), 'waitingCount', 'needsinputCount']) out[key] = 0;
    if (COUNT_FOR[session.state]) out[COUNT_FOR[session.state]] = 1;
    out.waitingCount = actions.filter((a) => a.state === 'waiting').length;
    out.active = { sessionId: SESSION_ID, project: session.project, model: session.model };
    return out;
  }

  return { start, stop, decide, overlay, active: () => running };
}

module.exports = { createDemoTour, DEMO_PREFIX, APPROVAL_TIMEOUT_MS };
