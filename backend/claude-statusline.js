'use strict';

// Claude Code subscription quota, read only from the documented statusLine
// interface: Claude Code pipes session JSON to the statusLine command, and for
// Pro / Max subscribers it includes rate_limits.five_hour / seven_day
// (used_percentage 0-100, resets_at in epoch seconds). No credentials are read
// and no undocumented endpoint is called.
//
// Taking over statusLine changes Claude Code's footer, so this is opt-in. An
// existing statusLine is kept in a sidecar file; the relay keeps printing its
// output and disabling restores it exactly.

const fs = require('fs');
const os = require('os');
const path = require('path');
const { statePath } = require('./paths');

const MARKER = 'agentpaw-statusline';
const LAUNCHER_NAME = 'agentpaw-statusline.ps1';
const WINDOWS = Object.freeze([['five_hour', 'fiveHour'], ['seven_day', 'weekly']]);

function settingsPath(homeDir = os.homedir()) {
  return path.join(homeDir, '.claude', 'settings.json');
}

function sidecarPath(homeDir = os.homedir()) {
  return statePath('claude-statusline.json', homeDir);
}

// Claude Code runs statusLine through Git Bash when present, else PowerShell.
// `powershell -File "<forward-slash path>"` behaves the same in both.
function launcherCommand(launcherPath) {
  return `powershell -NoProfile -ExecutionPolicy Bypass -File "${String(launcherPath).replace(/\\/g, '/')}"`;
}

function isOurs(statusLine) {
  return !!(statusLine && typeof statusLine === 'object' && typeof statusLine.command === 'string'
    && statusLine.command.includes(MARKER));
}

function percent(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null;
}

// statusLine stdin JSON -> { fiveHour, weekly } windows, or null when Claude Code
// sent no subscription limits (API key users, or before the first response).
function parseRateLimits(input) {
  const limits = input && typeof input === 'object' ? input.rate_limits : null;
  if (!limits || typeof limits !== 'object') return null;
  const out = {};
  for (const [source, key] of WINDOWS) {
    const raw = limits[source];
    const used = percent(raw && raw.used_percentage);
    const resetsAt = Number(raw && raw.resets_at);
    if (used === null) continue;
    out[key] = {
      usedPercent: used,
      remainingPercent: 100 - used,
      resetsAt: Number.isFinite(resetsAt) && resetsAt > 0 ? Math.round(resetsAt) : null,
    };
  }
  return Object.keys(out).length ? out : null;
}

// Validates what the relay posts to the local server.
function normalizeReport(data, now = Date.now()) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const windows = {};
  for (const [, key] of WINDOWS) {
    const raw = data.windows && data.windows[key];
    const used = percent(raw && raw.usedPercent);
    if (used === null) continue;
    const resetsAt = Number(raw.resetsAt);
    windows[key] = {
      usedPercent: used,
      remainingPercent: 100 - used,
      resetsAt: Number.isFinite(resetsAt) && resetsAt > 0 ? Math.round(resetsAt) : null,
    };
  }
  if (!Object.keys(windows).length) return null;
  return { windows, updatedAt: now };
}

// Shape shared with the Codex quota card. A window past its reset is full again
// until Claude Code reports the next one.
function cardState(report, now = Date.now()) {
  if (!report || !report.windows) return { status: 'idle', windows: {}, observedWindows: [], updatedAt: null };
  const windows = {};
  for (const [key, w] of Object.entries(report.windows)) {
    windows[key] = w.resetsAt && w.resetsAt * 1000 <= now
      ? { usedPercent: 0, remainingPercent: 100, resetsAt: null }
      : { ...w };
  }
  return { status: 'ready', windows, observedWindows: Object.keys(windows), updatedAt: report.updatedAt };
}

function readJson(file) {
  try {
    const raw = fs.readFileSync(file, 'utf8');
    return JSON.parse(raw.charCodeAt(0) === 0xfeff ? raw.slice(1) : raw);
  } catch (err) {
    if (err.code === 'ENOENT') return undefined;
    throw err;
  }
}

function writeJsonAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf8');
  fs.renameSync(tmp, file);
}

function createInstaller(options = {}) {
  const homeDir = options.homeDir || os.homedir();
  const SETTINGS = options.settingsPath || settingsPath(homeDir);
  const SIDECAR = options.sidecarPath || sidecarPath(homeDir);

  function readSettings() {
    const value = readJson(SETTINGS);
    if (value === undefined) return {};
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('settings.json is not an object');
    return value;
  }

  function readSidecar() {
    try {
      const value = readJson(SIDECAR);
      return value && value.schema === 1 ? value : null;
    } catch {
      return null;
    }
  }

  function status() {
    let current = null;
    try { current = readSettings().statusLine; } catch {}
    const sidecar = readSidecar();
    return {
      detected: fs.existsSync(path.dirname(SETTINGS)),
      enabled: isOurs(current),
      wrapped: !!(sidecar && sidecar.original),
    };
  }

  function enable(launcherPath) {
    const settings = readSettings();
    const current = settings.statusLine;
    const desired = launcherCommand(launcherPath);
    if (!isOurs(current)) {
      const original = current && typeof current === 'object' ? current : null;
      writeJsonAtomic(SIDECAR, { schema: 1, original });
      settings.statusLine = { type: 'command', command: desired };
      for (const key of ['padding', 'refreshInterval']) {
        if (original && original[key] !== undefined) settings.statusLine[key] = original[key];
      }
    } else if (current.command === desired) {
      return status();
    } else {
      settings.statusLine = { ...current, command: desired };
    }
    writeJsonAtomic(SETTINGS, settings);
    return status();
  }

  // Restores only when the statusLine is still ours; a statusLine the user
  // changed since then is theirs and stays.
  function disable() {
    const sidecar = readSidecar();
    let settings = null;
    try { settings = readSettings(); } catch {}
    if (settings && isOurs(settings.statusLine)) {
      if (sidecar && sidecar.original) settings.statusLine = sidecar.original;
      else delete settings.statusLine;
      writeJsonAtomic(SETTINGS, settings);
    }
    try { fs.unlinkSync(SIDECAR); } catch {}
    return status();
  }

  return { status, enable, disable, readSidecar, SETTINGS_PATH: SETTINGS, SIDECAR_PATH: SIDECAR };
}

module.exports = {
  MARKER,
  LAUNCHER_NAME,
  settingsPath,
  sidecarPath,
  launcherCommand,
  isOurs,
  parseRateLimits,
  normalizeReport,
  cardState,
  createInstaller,
};
