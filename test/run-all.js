'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const TESTS = Object.freeze([
  'smoke.js',
  'state-smoke.js',
  'pricing.js',
  'pricing-sync.js',
  'metering-common.js',
  'metering.js',
  'codex-metering.js',
  'codex-history.js',
  'codex-rate-limits.js',
  'codex-quota-estimate.js',
  'workbuddy-metering.js',
  'opencode-metering.js',
  'usage-stats.js',
  'usage-analytics.js',
  'source-registry.js',
  'integration-health.js',
  'privacy-mode.js',
  'agentpaw-migration.js',
  'config-external-write.js',
  'portable-runtime.js',
  'integration-detection.js',
  'ipc-contract.js',
  'auto-launch.js',
  'updater.js',
  'dist-verifier.js',
  'build-download.js',
  'xiaban-schedule.js',
  'rest-reminders.js',
  'rest-ui.js',
  'companion-main.js',
  'pet-pointer-recovery.js',
  'pet-visibility.js',
  'desktop-presence.js',
  'pet-assets.js',
  'pet-characters.js',
  'settings-assets.js',
  'focus.js',
  'deadcode.js',
  'codex-watch.js',
  'codex-integration.js',
  'i18n.js',
  'language.js',
  'pet-geometry.js',
  'radial-menu.js',
  'pet-insights.js',
  'chip-display.js',
  'popup-style.js',
  'branding.js',
  'opencode-plugin.js',
  'notify-policy.js',
  'task-workflow.js',
  'task-center-ui.js',
  'workflow-main.js',
]);

// Modules resolve ~/.agentpaw from os.homedir() at load time, so every suite
// runs against a throwaway home and never touches the developer's real state.
function isolatedEnv(home) {
  return { ...process.env, USERPROFILE: home, HOME: home };
}

function runAll() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'agentpaw-test-home-'));
  try {
    for (const file of TESTS) {
      const result = spawnSync(process.execPath, [path.join(__dirname, file)], {
        cwd: path.join(__dirname, '..'),
        env: isolatedEnv(home),
        stdio: 'inherit',
      });
      if (result.error) throw result.error;
      if (result.status !== 0) {
        process.exitCode = result.status || 1;
        return;
      }
    }
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
  console.log(`\nAgentPaw: ${TESTS.length} test suites passed`);
}

if (require.main === module) runAll();

module.exports = { TESTS, runAll, isolatedEnv };
