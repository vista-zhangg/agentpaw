'use strict';

const assert = require('assert');
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { loadRenderer } = require('./dom-stub');

async function main() {
  const world = loadRenderer([
    'shared/i18n.js', 'shared/states.js', 'shared/pet-assets.js',
    'shared/pet-insights.js', 'shared/pet-geometry.js', 'renderer/pet.js',
  ]);
  const { window, elements, sandbox, calls } = world;

  // Right-click on the cat closes any open surface and hands over to the native menu.
  vm.runInContext('actionPopOpen = true; quotaPopoverOpen = true', sandbox);
  elements('cat').dispatch('contextmenu', { preventDefault() {}, stopPropagation() {} });
  assert.equal(calls.filter((call) => call[0] === 'openPetMenu').length, 1, 'right-click opens the native menu');
  assert.equal(vm.runInContext('actionPopOpen || quotaPopoverOpen', sandbox), false,
    'opening the menu closes transient surfaces');
  elements('cat').dispatch('keydown', { key: 'ContextMenu', preventDefault() {} });
  assert.equal(calls.filter((call) => call[0] === 'openPetMenu').length, 2, 'the context-menu key opens the same menu');

  let settingsOpened = 0;
  window.pet.openSettings = () => settingsOpened++;
  vm.runInContext('actionPopOpen = true', sandbox);
  elements('ac-settings').dispatch('click');
  assert.equal(vm.runInContext('actionPopOpen', sandbox), false, 'the settings entry closes the quick view');
  assert.equal(settingsOpened, 1, 'the quick view header opens settings');

  const mainSource = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
  // The menu template itself: verbs for actions, check marks for switches.
  const menuSource = ['quietMenuItems', 'fullscreenMenuItem', 'petMenuItems']
    .map((name) => mainSource.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`))[0]).join('\n');
  const sent = [];
  let privacy = null, panels = 0, settings = 0, hidden = 0, snoozed = null;
  const menuWorld = {
    i18n: { text: (text, args = []) => text.replace(/\{(\d+)\}/g, (_, i) => args[i]) },
    config: { get: () => ({ privacyMode: true, quietMinutes: 45 }) },
    companionState: () => ({ visibility: { autoHideFullscreen: false } }),
    IPC: { WORKFLOW_COMMAND: 'workflow:command' },
    sendWin: (win, channel, payload) => sent.push([win, channel, payload]),
    openPanel: () => panels++, openSettings: () => settings++, hidePet: () => hidden++,
    setPrivacyMode: (value) => { privacy = value; }, setFullscreenPreference() {},
    petVisibility: { snooze: (minutes) => { snoozed = minutes; } }, applyPetVisibility() {},
  };
  vm.runInNewContext(`${menuSource}; result = petMenuItems('pet-window');`, menuWorld);
  const items = menuWorld.result;
  const labels = [...items].map((item) => item.type === 'separator' ? '-' : item.label);
  assert.deepStrictEqual(labels, ['详情面板', '快速视图', '-', '隐私模式', '全屏时自动藏起', '安静一会儿', '-', '设置…', '藏起，直到我再次打开']);
  assert.equal(items[3].type, 'checkbox'); assert.equal(items[3].checked, true, 'privacy shows its saved state');
  assert.equal(items[4].type, 'checkbox'); assert.equal(items[4].checked, false, 'fullscreen shows its saved state');
  assert.deepStrictEqual([...items[5].submenu].map((item) => item.label), ['安静 45 分钟 · 我的时长', '安静 15 分钟', '安静 30 分钟', '安静 60 分钟']);
  items[0].click(); items[1].click(); items[3].click({ checked: false }); items[5].submenu[2].click(); items[7].click(); items[8].click();
  assert.equal(panels, 1); assert.equal(settings, 1); assert.equal(hidden, 1); assert.equal(snoozed, 30);
  assert.equal(privacy, false, 'unchecking the menu item turns privacy off');
  assert.deepStrictEqual(sent, [['pet-window', 'workflow:command', 'peek']], 'quick view opens in the window that was clicked');

  // Exercise the main-process sender guard, not just the exposed bridge.
  const route = mainSource.match(/  ipcMain.on\(IPC.OPEN_SETTINGS,[\s\S]*?\n  \}\);/)[0];
  let handler, opened = 0;
  vm.runInNewContext(route, {
    IPC: { OPEN_SETTINGS: 'open-settings' }, ipcMain: { on: (_, fn) => { handler = fn; } },
    senderPetWin: e => e.sender === 'pet', openSettings: () => opened++,
  });
  handler({ sender: 'foreign' }); handler({ sender: 'pet' });
  assert.equal(opened, 1, 'only pet windows can use the settings entry');
  const existingWindowBranch = mainSource.slice(mainSource.indexOf('function openSettings()'), mainSource.indexOf('  const win = new BrowserWindow', mainSource.indexOf('function openSettings()')));
  let shown = 0, focused = 0;
  vm.runInNewContext(existingWindowBranch + '}; openSettings(); openSettings();', {
    settingsWin: { isDestroyed: () => false, show: () => shown++, focus: () => focused++ },
  });
  assert.equal(shown, 2); assert.equal(focused, 2, 'existing settings window is reused and focused');
  console.log('Pet menu, settings entries and window reuse checks passed.');
  process.exit(0); // pet.js keeps animation and refresh timers alive.
}

main().catch((error) => { console.error(error); process.exit(1); });
