'use strict';

// Guards against rewriting the usage ledgers on every 30-second scan: on a real
// install that was about 2 GB of writes an hour and a synchronous JSON.stringify
// on the Electron main process. Idle scans never write, busy scans share one
// delayed write, and a crash before that write loses and duplicates nothing.

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createMetering } = require('../backend/metering');
const { createCodexMetering } = require('../backend/codex-metering');
const { createWorkbuddyMetering } = require('../backend/workbuddy-metering');
const { createOpenCodeMetering } = require('../backend/opencode-metering');

const { SAVE_DELAY_MS } = require('../backend/metering-common');

const TEST_DELAY_MS = 150;
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const stamp = new Date().toISOString();
const usage = { input_tokens: 10, output_tokens: 5 };

function write(file, row) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.appendFileSync(file, JSON.stringify(row) + '\n');
}

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'agentpaw-idle-save-'));
  const dirFor = name => { const dir = path.join(root, name, 'state'); fs.mkdirSync(dir, { recursive: true }); return dir; };
  let serial = 0;
  const claudeRow = () => ({ type: 'assistant', timestamp: stamp, requestId: `r${++serial}`, message: { id: `m${serial}`, model: 'claude-x', usage } });
  const codexRow = () => ({ timestamp: stamp, type: 'event_msg', payload: { type: 'token_count', info: {
    total_token_usage: { input_tokens: 10 * ++serial, cached_input_tokens: 0, output_tokens: 5, reasoning_output_tokens: 0, total_tokens: 10 * serial + 5 },
    last_token_usage: { input_tokens: 10, cached_input_tokens: 0, output_tokens: 5, reasoning_output_tokens: 0, total_tokens: 15 },
  } } });
  const workbuddyRow = () => ({ type: 'assistant', timestamp: stamp, message: { id: `w${++serial}`, model: 'claude-x', usage } });
  const opencodeRow = () => ({ v: 1, ts: Date.now(), session_id: 's', message_id: `o${++serial}`, model: 'gpt-x', cost: 0.01, tokens: { input: 10, output: 5 } });

  const claudeFile = path.join(root, 'claude', 'projects', 'p', 't.jsonl');
  const codexFile = path.join(root, 'codex', 'sessions', 'rollout-a.jsonl');
  const workbuddyFile = path.join(root, 'workbuddy', 'projects', 'p', 't.jsonl');
  const opencodeFile = path.join(root, 'opencode', 'usage.jsonl');

  const meters = [
    { name: 'claude', file: claudeFile, row: claudeRow, stateDir: dirFor('claude'), ledger: 'usage.json',
      make: (stateDir, saveDelayMs) => createMetering({ projectsDir: path.dirname(path.dirname(claudeFile)), stateDir, saveDelayMs, pricingOverridePath: path.join(stateDir, 'none.json') }) },
    { name: 'codex', file: codexFile, row: codexRow, stateDir: dirFor('codex'), ledger: 'codex-usage.json',
      make: (stateDir, saveDelayMs) => createCodexMetering({ sessionsDir: path.dirname(codexFile), stateDir, saveDelayMs }) },
    { name: 'workbuddy', file: workbuddyFile, row: workbuddyRow, stateDir: dirFor('workbuddy'), ledger: 'workbuddy-usage.json',
      make: (stateDir, saveDelayMs) => createWorkbuddyMetering({ projectsDir: path.dirname(path.dirname(workbuddyFile)), stateDir, saveDelayMs, pricingOverridePath: path.join(stateDir, 'none.json') }) },
    { name: 'opencode', file: opencodeFile, row: opencodeRow, stateDir: dirFor('opencode'), ledger: 'opencode-usage.json',
      make: (stateDir, saveDelayMs) => createOpenCodeMetering({ usageFile: opencodeFile, stateDir, saveDelayMs }) },
  ];
  assert(SAVE_DELAY_MS >= 5 * 60 * 1000, 'the shipped delay keeps writes rare');
  for (const meter of meters) {
    write(meter.file, meter.row());
    meter.instance = meter.make(meter.stateDir, TEST_DELAY_MS);
    meter.path = path.join(meter.stateDir, meter.ledger);
  }
  const scanAll = () => Promise.all(meters.map(meter => meter.instance.scan()));
  const ledgers = () => Object.fromEntries(meters.map(meter => [meter.name, fs.readFileSync(meter.path, 'utf8')]));

  try {
    await scanAll();
    await wait(TEST_DELAY_MS * 3);
    const first = ledgers(); // every ledger exists after the first scan of a run

    await scanAll();
    await scanAll();
    await wait(TEST_DELAY_MS * 3);
    const idle = ledgers();
    for (const meter of meters) assert.strictEqual(idle[meter.name], first[meter.name], `${meter.name}: an idle scan does not rewrite the ledger`);

    for (const meter of meters) write(meter.file, meter.row());
    await scanAll();
    await wait(TEST_DELAY_MS * 3);
    const changed = ledgers();
    for (const meter of meters) assert.notStrictEqual(changed[meter.name], idle[meter.name], `${meter.name}: new usage is saved`);
    for (const meter of meters) meter.instance.stop();

    // Crash before the delayed write: live numbers are right, the disk is one
    // step behind, and the next run replays the gap exactly once.
    for (const meter of meters) {
      write(meter.file, meter.row());
      meter.instance = meter.make(meter.stateDir, 60 * 60 * 1000);
    }
    await scanAll();
    await wait(TEST_DELAY_MS);
    const before = ledgers();
    const live = Object.fromEntries(meters.map(meter => [meter.name, meter.instance.getStats().lifetime.tokens]));
    for (const meter of meters) write(meter.file, meter.row());
    await scanAll();
    await wait(TEST_DELAY_MS);
    const grown = Object.fromEntries(meters.map(meter => [meter.name, meter.instance.getStats().lifetime.tokens]));
    for (const meter of meters) {
      assert(grown[meter.name] > live[meter.name], `${meter.name}: live numbers do not wait for the save`);
      assert.strictEqual(fs.readFileSync(meter.path, 'utf8'), before[meter.name], `${meter.name}: busy scans share the delayed write`);
    }
    for (const meter of meters) {
      const recovered = meter.make(meter.stateDir, 60 * 60 * 1000);
      await recovered.scan();
      assert.strictEqual(recovered.getStats().lifetime.tokens, grown[meter.name], `${meter.name}: a crash neither loses nor repeats usage`);
      recovered.stop();
      assert.notStrictEqual(fs.readFileSync(meter.path, 'utf8'), before[meter.name], `${meter.name}: quitting saves what is pending`);
    }
    console.log('idle meter save checks passed');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
})().catch((error) => { console.error(error); process.exit(1); });
