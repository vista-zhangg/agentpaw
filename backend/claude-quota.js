'use strict';

// Claude Code quota state for the main process: the opt-in statusLine switch,
// the latest report from the relay, and the card shown in the details panel.

const fs = require('fs');
const path = require('path');
const statusline = require('./claude-statusline');
const hookRuntime = require('./hook-runtime');
const { statePath } = require('./paths');

function createClaudeQuota(options = {}) {
  const config = options.config || require('./config');
  const installer = options.installer || statusline.createInstaller();
  const runtime = options.hookRuntime || hookRuntime;
  const reportPath = options.reportPath || statePath('claude-quota.json');
  const now = options.now || Date.now;
  let report = load();

  function load() {
    try {
      const raw = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
      return statusline.normalizeReport(raw, Number(raw.updatedAt) || 0);
    } catch {
      return null;
    }
  }

  function persist() {
    try {
      fs.mkdirSync(path.dirname(reportPath), { recursive: true });
      const tmp = `${reportPath}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(report), 'utf8');
      fs.renameSync(tmp, reportPath);
    } catch {}
  }

  function record(next) {
    if (!next || !next.windows) return false;
    report = next;
    persist();
    return true;
  }

  function enabled() {
    return config.get().claudeQuotaEnabled === true;
  }

  function card() {
    if (!enabled()) return null;
    return { ...statusline.cardState(report, now()), enabled: true };
  }

  function setting() {
    let state = { detected: false, enabled: false, wrapped: false };
    try { state = installer.status(); } catch {}
    return { ok: true, ...state, enabled: enabled() && state.enabled };
  }

  function setEnabled(value) {
    try {
      if (value) {
        runtime.stageHookRuntime();
        installer.enable(runtime.statusLineLauncherPath());
      } else {
        installer.disable();
      }
      config.save({ claudeQuotaEnabled: value === true });
      return setting();
    } catch (err) {
      return { ...setting(), ok: false, error: err && err.message ? err.message : 'failed' };
    }
  }

  // On start: refresh the launcher, or drop the switch when the user has since
  // replaced the statusLine themselves.
  function reconcile() {
    if (!enabled()) return setting();
    let state = null;
    try { state = installer.status(); } catch {}
    if (!state || !state.enabled) {
      try { installer.disable(); } catch {}
      config.save({ claudeQuotaEnabled: false });
      return setting();
    }
    return setEnabled(true);
  }

  return { record, card, setting, setEnabled, reconcile };
}

module.exports = { createClaudeQuota };
