'use strict';

// Merge-safe Claude Code hook installer (original implementation).
//
// Now a thin config over the shared installer base — see backend/hookinstall-base.js.
// Registers, into ~/.claude/settings.json, lifecycle hooks that run our
// agentpaw-hook.js, plus one blocking HTTP hook for PermissionRequest.

const os = require('os');
const path = require('path');
const { createInstaller } = require('./hookinstall-base');
const hookRuntime = require('./hook-runtime');

const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');
const HOOK_SCRIPT = hookRuntime.runtimeHookPath('agentpaw-hook.js');
const MARKER = 'agentpaw-hook.js';

// Tool events fire on every tool call and only report state, so they run in
// the background. Late arrivals are ordered by event_ts in core.js.
const ASYNC_EVENTS = ['PreToolUse', 'PostToolUse', 'PostToolUseFailure'];

const COMMAND_EVENTS = [
  'SessionStart', 'SessionEnd', 'UserPromptSubmit',
  'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'Stop', 'StopFailure',
  'SubagentStart', 'SubagentStop',
  'PreCompact', 'PostCompact',
  'Notification', 'Elicitation',
];

module.exports = createInstaller({
  integrationId: 'claude',
  integrationLabel: 'Claude Code',
  detectPath: path.dirname(SETTINGS_PATH),
  settingsPath: SETTINGS_PATH,
  hookScript: HOOK_SCRIPT,
  marker: MARKER,
  events: COMMAND_EVENTS,
  asyncEvents: ASYNC_EVENTS,
  withPermission: true, // Claude Code supports the blocking PermissionRequest hook
});

// CLI: `node backend/hookinstall.js` installs; `--uninstall` removes.
if (require.main === module) {
  const { readRuntimeConfig } = require('./transport');
  if (process.argv.includes('--uninstall')) {
    console.log(module.exports.unregisterHooks({ backup: true }));
  } else {
    hookRuntime.stageHookRuntime();
    const runtime = readRuntimeConfig();
    console.log(module.exports.registerHooks(runtime && runtime.port, runtime && runtime.token));
  }
}
