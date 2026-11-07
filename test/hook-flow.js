'use strict';

// Guards the hook path that runs on every tool call:
// - tool hooks must stay background, including for hooks installed by an older
//   version, or every tool call waits on a process start again;
// - a late background tool event must not undo a later lifecycle event;
// - quitting the pet must hand a pending approval back, never answer it.

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentpaw-hook-flow-'));
process.env.USERPROFILE = home;
process.env.HOME = home;

const hookRuntime = require('../backend/hook-runtime');
const installer = require('../backend/hookinstall');
const { writeRuntimeConfig, PORTS } = require('../backend/transport');
const { createCore } = require('../backend/core');
const { createPermissions } = require('../backend/permission');

const TOKEN = 'a'.repeat(64);
const ASYNC = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure'];
const read = () => JSON.parse(fs.readFileSync(installer.SETTINGS_PATH, 'utf8'));
const ours = (settings, event) => settings.hooks[event].flatMap(group => group.hooks)
  .find(hook => hook.command && hook.command.includes(installer.MARKER));

function installerChecks() {
  hookRuntime.stageHookRuntime({ executable: process.execPath, runAsNode: false });
  fs.mkdirSync(path.dirname(installer.SETTINGS_PATH), { recursive: true });
  const userHook = { type: 'command', command: 'echo mine' };
  fs.writeFileSync(installer.SETTINGS_PATH, JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [userHook] }] } }));

  installer.registerHooks(41330, TOKEN);
  let settings = read();
  for (const event of ASYNC) assert.strictEqual(ours(settings, event).async, true, `${event} runs in the background`);
  for (const event of installer.COMMAND_EVENTS.filter(name => !ASYNC.includes(name))) {
    assert.strictEqual(ours(settings, event).async, undefined, `${event} stays in order`);
  }
  assert.deepStrictEqual(settings.hooks.PreToolUse[0].hooks[0], userHook, 'the user hook is untouched');
  assert.strictEqual(installer.hooksCurrent(41330, TOKEN), true);

  // Hooks written by 2.1.1 have the right command but still block.
  delete ours(settings, 'PostToolUse').async;
  fs.writeFileSync(installer.SETTINGS_PATH, JSON.stringify(settings));
  assert.strictEqual(installer.hooksCurrent(41330, TOKEN), false, 'a blocking tool hook counts as outdated');
  installer.registerHooks(41330, TOKEN);
  assert.strictEqual(ours(read(), 'PostToolUse').async, true, 'an upgrade moves it to the background');
}

function coreChecks() {
  const core = createCore({});
  const event = (state, name, eventTs) => core.updateSession('s', state, name, { agentId: 'claude-code', eventTs });

  event('thinking', 'UserPromptSubmit', 1000);
  event('working', 'PreToolUse', 1100);
  event('idle', 'Stop', 2000);
  assert.strictEqual(core.getSession('s').state, 'idle');
  event('working', 'PostToolUse', 1500);
  assert.strictEqual(core.getSession('s').state, 'idle', 'a late tool event does not reopen a finished turn');
  event('error', 'PostToolUseFailure', 1600);
  assert.strictEqual(core.getSession('s').state, 'idle', 'a late failure does not mark a finished turn');

  event('thinking', 'UserPromptSubmit', 3000);
  event('working', 'PreToolUse', 3100);
  assert.strictEqual(core.getSession('s').state, 'working', 'tool events of the next turn apply');
  core.updateSession('s', 'notification', 'Elicitation', { agentId: 'claude-code', eventTs: 3300 });
  event('working', 'PreToolUse', 3200);
  assert.strictEqual(core.getSession('s').state, 'notification', 'a waiting question is not overwritten');

  core.updateSession('s', 'working', 'PreToolUse', { agentId: 'claude-code' });
  assert.strictEqual(core.getSession('s').state, 'working', 'events without a timestamp keep working');

  core.updateSession('new', 'working', 'PostToolUse', { agentId: 'claude-code', eventTs: 5 });
  assert.strictEqual(core.getSession('new').state, 'working', 'an unseen session is not dropped');
}

function quitChecks() {
  const permissions = createPermissions({});
  let destroyed = false;
  let written = '';
  const res = {
    destroyed: false, writableEnded: false, writableFinished: false,
    on() {}, off() {}, writeHead() {},
    end(body) { written += body; this.writableEnded = true; },
    destroy() { destroyed = true; this.destroyed = true; },
  };
  permissions.addPermission(res, { toolName: 'Bash', toolInput: { command: 'ls' }, sessionId: 's' });
  assert.strictEqual(permissions.getPending().length, 1);
  permissions.cleanup();
  assert.strictEqual(permissions.getPending().length, 0);
  assert.strictEqual(written, '', 'no decision is written on quit');
  assert.strictEqual(destroyed, true, 'the agent is released to its own prompt');
}

function hookStampsEvents() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        res.writeHead(200, { 'x-agentpaw-server': 'agentpaw' });
        res.end('{}');
        server.close();
        resolve(JSON.parse(body));
      });
    });
    const ports = [...PORTS].reverse(); // the hook only trusts AgentPaw's port range
    server.on('error', () => (ports.length ? server.listen(ports.shift(), '127.0.0.1') : reject(new Error('no free port'))));
    server.listen(ports.shift(), '127.0.0.1');
    server.on('listening', () => {
      writeRuntimeConfig(server.address().port, TOKEN);
      const child = spawn(process.execPath, [path.join(__dirname, '..', 'hook', 'agentpaw-hook.js'), 'PostToolUse'],
        { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, stdio: ['pipe', 'ignore', 'ignore'] });
      child.on('error', reject);
      child.stdin.end(JSON.stringify({ session_id: 's', tool_name: 'Read' }));
    });
    setTimeout(() => reject(new Error('hook did not post')), 10000).unref();
  });
}

(async () => {
  try {
    installerChecks();
    coreChecks();
    quitChecks();
    const before = Date.now();
    const body = await hookStampsEvents();
    assert(body.event_ts >= before && body.event_ts <= Date.now(), 'the hook stamps when the event happened');
    console.log('hook flow checks passed');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exit(1); });
