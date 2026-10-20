'use strict';

// Claude Code plan usage via the documented statusLine stdin JSON: parsing,
// merge-safe install / exact restore, the relay round trip and the opt-in switch.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const statusline = require('../backend/claude-statusline');
const relay = require('../hook/agentpaw-statusline');
const hookRuntime = require('../backend/hook-runtime');
const { createClaudeQuota } = require('../backend/claude-quota');

const root = path.join(__dirname, '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'agentpaw-claude-quota-'));
const NOW = 1_800_000_000_000;

// Example payload shape from code.claude.com/docs/en/statusline.
const SAMPLE = {
  session_id: 'abc',
  model: { display_name: 'Opus' },
  context_window: { used_percentage: 8 },
  rate_limits: {
    five_hour: { used_percentage: 23.5, resets_at: 1800003600 },
    seven_day: { used_percentage: 41.2, resets_at: 1800300000 },
  },
};

async function main() {
  // Parsing: only the documented fields, clamped; absent for API-key users.
  assert.deepStrictEqual(statusline.parseRateLimits(SAMPLE), {
    fiveHour: { usedPercent: 23.5, remainingPercent: 76.5, resetsAt: 1800003600 },
    weekly: { usedPercent: 41.2, remainingPercent: 58.8, resetsAt: 1800300000 },
  });
  assert.strictEqual(statusline.parseRateLimits({ model: {} }), null, 'no rate_limits means no report');
  assert.deepStrictEqual(statusline.parseRateLimits({ rate_limits: { seven_day: { used_percentage: 140 } } }),
    { weekly: { usedPercent: 100, remainingPercent: 0, resetsAt: null } });
  assert.strictEqual(statusline.normalizeReport({ windows: { fiveHour: { usedPercent: 'x' } } }), null);
  assert.strictEqual(statusline.normalizeReport([]), null);

  const report = statusline.normalizeReport({ windows: statusline.parseRateLimits(SAMPLE) }, NOW);
  const card = statusline.cardState(report, NOW);
  assert.strictEqual(card.status, 'ready');
  assert.deepStrictEqual(card.observedWindows, ['fiveHour', 'weekly']);
  const later = statusline.cardState(report, 1800003600 * 1000 + 1);
  assert.deepStrictEqual(later.windows.fiveHour, { usedPercent: 0, remainingPercent: 100, resetsAt: null },
    'a window past its reset is full again');
  assert.strictEqual(later.windows.weekly.remainingPercent, 58.8);

  // Install without an existing statusLine; every other setting is untouched.
  const settingsPath = path.join(tmp, '.claude', 'settings.json');
  const sidecarPath = path.join(tmp, '.agentpaw', 'claude-statusline.json');
  const launcher = path.join(tmp, 'hook runtime', 'hook', statusline.LAUNCHER_NAME);
  const installer = statusline.createInstaller({ settingsPath, sidecarPath });
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  const base = { model: 'opus', hooks: { Stop: [{ matcher: '', hooks: [{ type: 'command', command: 'x' }] }] } };
  fs.writeFileSync(settingsPath, '\ufeff' + JSON.stringify(base));
  let state = installer.enable(launcher);
  let settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  assert(state.enabled && !state.wrapped);
  assert.strictEqual(settings.statusLine.type, 'command');
  assert(settings.statusLine.command.startsWith('powershell -NoProfile -ExecutionPolicy Bypass -File "'));
  assert(!settings.statusLine.command.includes('\\'), 'forward slashes survive Git Bash');
  assert.deepStrictEqual({ ...settings, statusLine: undefined }, { ...base, statusLine: undefined });
  installer.disable();
  settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  assert.deepStrictEqual(settings, base, 'disable removes only our statusLine');
  assert(!fs.existsSync(sidecarPath));

  // Wrap an existing statusLine, idempotently, and restore it exactly.
  const own = { type: 'command', command: '~/.claude/statusline.sh', padding: 2, refreshInterval: 5 };
  fs.writeFileSync(settingsPath, JSON.stringify({ ...base, statusLine: own }));
  installer.enable(launcher);
  const first = fs.readFileSync(settingsPath, 'utf8');
  state = installer.enable(launcher);
  assert.strictEqual(fs.readFileSync(settingsPath, 'utf8'), first, 'enabling twice changes nothing');
  settings = JSON.parse(first);
  assert(state.enabled && state.wrapped);
  assert.strictEqual(settings.statusLine.padding, 2);
  assert.strictEqual(settings.statusLine.refreshInterval, 5);
  assert.deepStrictEqual(installer.readSidecar().original, own);
  installer.disable();
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(settingsPath, 'utf8')).statusLine, own, 'original restored');

  // A statusLine the user set after enabling is theirs; disable leaves it.
  installer.enable(launcher);
  const replaced = { type: 'command', command: 'npx ccstatusline' };
  settings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
  fs.writeFileSync(settingsPath, JSON.stringify({ ...settings, statusLine: replaced }));
  assert.strictEqual(installer.status().enabled, false);
  installer.disable();
  assert.deepStrictEqual(JSON.parse(fs.readFileSync(settingsPath, 'utf8')).statusLine, replaced);

  // Relay output: default line, or the wrapped command through the same shell.
  assert.strictEqual(relay.defaultLine(SAMPLE, statusline.parseRateLimits(SAMPLE)), 'Opus · ctx 8% · 5h 24% · 7d 41%');
  assert.strictEqual(relay.defaultLine({}, null), '');
  const raw = JSON.stringify(SAMPLE);
  const viaBash = relay.runOriginal({ command: 'cat' }, raw, { ...process.env, MSYSTEM: 'MINGW64' });
  assert.strictEqual(viaBash, raw, 'Git Bash statusLine receives the same stdin');
  const env = { ...process.env, ELECTRON_RUN_AS_NODE: '1' };
  delete env.MSYSTEM;
  const viaPowerShell = relay.runOriginal({ command: "Write-Output 'own line'" }, raw, env);
  assert.strictEqual(viaPowerShell.trim(), 'own line');
  assert.strictEqual(relay.runOriginal(null, raw), null);

  // The runtime ships the relay and a launcher that both shells can start.
  assert(hookRuntime.RUNTIME_FILES.includes('hook/agentpaw-statusline.js'));
  assert(hookRuntime.RUNTIME_FILES.includes('backend/claude-statusline.js'));
  const ps1 = hookRuntime.statusLineLauncher({ executable: "C:/Apps/O'Paw/AgentPaw.exe", runAsNode: true }, 'C:/x/agentpaw-statusline.js');
  assert(ps1.includes("Test-Path -LiteralPath 'C:/Apps/O''Paw/AgentPaw.exe'"), 'missing app exits quietly');
  assert(ps1.includes("$env:ELECTRON_RUN_AS_NODE = '1'") && ps1.includes('[Console]::OutputEncoding = $utf8'));
  const staged = hookRuntime.stageHookRuntime({ sourceRoot: root, homeDir: tmp, executable: process.execPath, runAsNode: false });
  const stagedLauncher = hookRuntime.statusLineLauncherPath(tmp);
  assert(fs.existsSync(stagedLauncher) && staged.root === hookRuntime.runtimeDir(tmp));
  assert(!fs.readFileSync(stagedLauncher, 'utf8').includes('ELECTRON_RUN_AS_NODE'));

  // Round trip: relay process -> local server -> main-process callback.
  const { createServer } = require('../backend/server');
  let received = null;
  const server = createServer({ core: {}, permissions: {}, onClaudeQuota: (r) => { received = r; } });
  server.start();
  for (let i = 0; i < 50 && !server.getPort(); i++) await new Promise((r) => setTimeout(r, 20));
  const out = await new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(root, 'hook', 'agentpaw-statusline.js')], { env: process.env });
    let text = '';
    child.stdout.on('data', (d) => { text += d; });
    child.on('close', () => resolve(text));
    child.stdin.end(raw);
  });
  assert.strictEqual(out.trim(), 'Opus · ctx 8% · 5h 24% · 7d 41%');
  assert(received && received.windows.fiveHour.usedPercent === 23.5, 'server receives the plan usage');
  const port = server.getPort();
  const status = await new Promise((resolve) => {
    const req = require('http').request({ hostname: '127.0.0.1', port, path: '/claude-quota', method: 'POST',
      headers: { 'Content-Type': 'application/json' } }, (res) => { res.resume(); resolve(res.statusCode); });
    req.end('{}');
  });
  assert.strictEqual(status, 403, 'the quota route needs the runtime token');
  server.stop();

  // Opt-in switch: off by default, reconcile drops it when the user took over.
  let saved = { claudeQuotaEnabled: false };
  const config = { get: () => saved, save: (patch) => { saved = { ...saved, ...patch }; return saved; } };
  let installed = false;
  const fake = {
    status: () => ({ detected: true, enabled: installed, wrapped: false }),
    enable: () => { installed = true; },
    disable: () => { installed = false; },
  };
  const runtime = { stageHookRuntime: () => ({}), statusLineLauncherPath: () => launcher };
  const quota = createClaudeQuota({ config, installer: fake, hookRuntime: runtime,
    reportPath: path.join(tmp, 'claude-quota.json'), now: () => NOW });
  assert.strictEqual(quota.card(), null, 'hidden until enabled');
  assert.strictEqual(quota.setEnabled(true).enabled, true);
  assert.strictEqual(quota.card().status, 'idle');
  assert(quota.record(report));
  assert.strictEqual(quota.card().windows.weekly.usedPercent, 41.2);
  const reloaded = createClaudeQuota({ config, installer: fake, hookRuntime: runtime,
    reportPath: path.join(tmp, 'claude-quota.json'), now: () => NOW });
  assert.strictEqual(reloaded.card().status, 'ready', 'last report survives a restart');
  installed = false;
  assert.strictEqual(reloaded.reconcile().enabled, false);
  assert.strictEqual(saved.claudeQuotaEnabled, false);

  // Tray menu: a Claude section only while enabled; a waiting note before data.
  const vm = require('vm');
  const mainSource = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  const start = mainSource.indexOf('function claudeTrayItems()');
  const trayFn = mainSource.slice(start, mainSource.indexOf('\nfunction refreshTrayMenu()', start));
  const trayWorld = (card) => {
    const world = {
      claudeQuota: { card: () => card }, codexQuotaTray: require('../backend/codex-quota-tray'),
      i18n: { text: (s) => s }, t: (key, vars) => `${key}:${vars.label || vars.time}`,
    };
    vm.runInNewContext(`${trayFn}; result = claudeTrayItems();`, world);
    return [...world.result].map((item) => item.type === 'separator' ? '-' : item.label);
  };
  assert.deepStrictEqual(trayWorld(null), [], 'no tray section while off');
  assert.deepStrictEqual(trayWorld({ status: 'idle', windows: {} }), ['-', 'Claude Code 额度', '在终端运行 claude 并收到回复后更新']);
  assert.deepStrictEqual(trayWorld(statusline.cardState(report, NOW)).slice(1, 4),
    ['Claude Code 额度', 'tray.quotaWindow:5h', 'tray.quotaWindow:7d']);
  assert(/claudeQuota\.record\(report\)\) \{ emitStats\(\); refreshTrayMenu\(\); \}/.test(mainSource), 'new data refreshes the tray');
  const quickView = fs.readFileSync(path.join(root, 'renderer', 'quick-view.js'), 'utf8');
  assert(quickView.includes('stats.claudeQuota') && quickView.includes('终端 claude 回复后更新'), 'quick view shows a Claude tile');

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('Claude Code plan usage: parsing, statusLine install/restore, relay and switch checks passed');
}

main().catch((err) => { console.error(err); process.exit(1); });
