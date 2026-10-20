#!/usr/bin/env node
'use strict';

// AgentPaw statusLine relay for Claude Code (opt-in, see backend/claude-statusline.js).
// Claude Code pipes session JSON on stdin. The relay forwards only the
// subscription rate limits to the local AgentPaw server, then prints the user's
// original status line when one was wrapped, or a short default line.

const { spawnSync } = require('child_process');
const transport = require('../backend/transport');
const statusline = require('../backend/claude-statusline');

const ORIGINAL_TIMEOUT_MS = 5000;

function readStdin(cb) {
  const chunks = [];
  let done = false;
  const finish = () => { if (!done) { done = true; cb(Buffer.concat(chunks).toString('utf8')); } };
  process.stdin.on('data', (chunk) => chunks.push(chunk));
  process.stdin.on('end', finish);
  process.stdin.on('error', finish);
  setTimeout(finish, 2000).unref();
}

function defaultLine(input, windows) {
  const parts = [];
  const model = input && input.model && input.model.display_name;
  if (typeof model === 'string' && model) parts.push(model);
  const ctx = Number(input && input.context_window && input.context_window.used_percentage);
  if (Number.isFinite(ctx)) parts.push(`ctx ${Math.round(ctx)}%`);
  if (windows && windows.fiveHour) parts.push(`5h ${Math.round(windows.fiveHour.usedPercent)}%`);
  if (windows && windows.weekly) parts.push(`7d ${Math.round(windows.weekly.usedPercent)}%`);
  return parts.join(' · ');
}

// Run the wrapped command through the same shell Claude Code used: Git Bash
// leaves MSYSTEM in the environment, PowerShell does not.
function runOriginal(original, raw, env = process.env) {
  if (!original || typeof original.command !== 'string' || !original.command.trim()) return null;
  const childEnv = { ...env };
  delete childEnv.ELECTRON_RUN_AS_NODE;
  const [file, args] = env.MSYSTEM
    ? ['bash', ['-c', original.command]]
    : ['powershell', ['-NoProfile', '-Command', original.command]];
  const result = spawnSync(file, args, {
    input: raw, env: childEnv, encoding: 'utf8', timeout: ORIGINAL_TIMEOUT_MS, windowsHide: true,
  });
  return typeof result.stdout === 'string' ? result.stdout : '';
}

function main() {
  readStdin((raw) => {
    let input = null;
    try { input = JSON.parse(raw); } catch {}
    const windows = statusline.parseRateLimits(input);
    const print = () => {
      const sidecar = statusline.createInstaller().readSidecar();
      const original = sidecar && sidecar.original;
      const out = original ? runOriginal(original, raw) : defaultLine(input, windows);
      if (out) process.stdout.write(out.endsWith('\n') ? out : out + '\n');
    };
    if (!windows) { print(); return; }
    transport.postJson(transport.CLAUDE_QUOTA_PATH, { windows }, () => print());
  });
}

if (require.main === module) main();

module.exports = { defaultLine, runOriginal };
