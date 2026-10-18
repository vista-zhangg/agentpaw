'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const i18n = require('../shared/i18n');
const { IPC } = require('../shared/ipc-channels');
const config = require('../backend/config');

assert.equal(i18n.getLanguage(), 'en');
assert.equal(config.sanitize({}).language, 'en');
for (const language of i18n.LANGUAGES) assert.equal(config.sanitize({ language }).language, language);
assert.equal(config.sanitize({ language: 'invalid' }).language, 'en');

const source = fs.readFileSync(path.join(__dirname, '../main.js'), 'utf8');
const start = source.indexOf('function registerIpc() {');
const end = source.indexOf('  const senderPetWin =', start);
assert(start >= 0 && end > start);
const handlers = new Map();
const messages = [];
const makeWindow = name => ({ isDestroyed: () => false, webContents: { send: (channel, value) => messages.push({ name, channel, value }) } });
const settingsWin = makeWindow('settings');
let saved = { language: 'en' };
let trayUpdates = 0;
const context = {
  IPC, i18n, settingsWin, petWin: makeWindow('pet'), panelWin: makeWindow('panel'),
  ipcMain: { handle: (channel, fn) => handlers.set(channel, fn) },
  config: { save: patch => (saved = { ...saved, ...patch }) },
  refreshTrayMenu: () => trayUpdates++, emitStats() {}, sendPanel() {}, combinedPriceInfo: () => ({}),
};
vm.runInNewContext(source.slice(start, end) + '\n}\nregisterIpc();', context);
const set = handlers.get(IPC.SET_LANGUAGE);
assert.equal(handlers.get(IPC.GET_LANGUAGE)(), 'en');
assert.equal(set({ sender: {} }, 'zh-Hant').ok, false, 'only Settings may change language');
assert.equal(set({ sender: settingsWin.webContents }, 'invalid').ok, false);
assert.equal(saved.language, 'en');
for (const language of ['zh-Hans', 'zh-Hant', 'en']) {
  messages.length = 0;
  const result = set({ sender: settingsWin.webContents }, language);
  assert.equal(result.ok, true);
  assert.equal(saved.language, language);
  assert.equal(i18n.getLanguage(), language);
  assert.deepStrictEqual(messages.map(row => row.name), ['pet', 'panel', 'settings']);
  assert(messages.every(row => row.channel === IPC.LANGUAGE && row.value === language));
}
assert.equal(trayUpdates, 3);

// Persisted preferences are independent of the chosen language and survive sanitization.
const sanitized = config.sanitize({ language: 'zh-Hant', privacyMode: true, quietMinutes: 17 });
assert.equal(sanitized.privacyMode, true);
assert.equal(sanitized.quietMinutes, 17);
assert.equal(sanitized.language, 'zh-Hant');
console.log('Language defaults, validation, Settings authorization and cross-window updates passed');

const world = require('./dom-stub').createStubWorld();
world.window.pet.language = 'en';
world.sandbox.setInterval = () => 0;
world.sandbox.setTimeout = () => 0;
vm.createContext(world.sandbox);
for (const file of ['shared/messages.js', 'shared/i18n.js', 'shared/states.js', 'shared/pet-assets.js', 'shared/pet-insights.js', 'renderer/pet.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), world.sandbox);
}
vm.runInContext(`askQueue=[{kind:'ask',permId:'choice',sessionId:'one',project:'Untouched project',questions:[{question:'Keep this question unchanged',multiSelect:true,options:[{label:'Original answer'}]}]}];askIdx=0;showAskPanel();elic.selSet=['Original answer'];elic.otherOn=true;askText.value='My draft';askScroll.scrollTop=12;`, world.sandbox);
for (const language of ['zh-Hant', 'zh-Hans', 'en']) {
  world.window.AgentPawI18n.setLanguage(language);
  world.window.dispatch('agentpaw:language');
  assert.equal(world.elements('ask-text').value, 'My draft', 'switching language preserves an answer draft');
  assert.equal(world.elements('ask-q').textContent, 'Keep this question unchanged');
  assert.equal(vm.runInContext(`elic.selSet[0]`, world.sandbox), 'Original answer');
  assert.equal(vm.runInContext('elic.otherOn', world.sandbox), true);
}
console.log('Live renderer language switching preserves questions, selected options and answer drafts');

(async () => {
  const boot = require('./dom-stub').createStubWorld();
  boot.window.pet.language = 'en';
  let push, resolveInitial;
  boot.window.pet.onLanguage = callback => { push = callback; };
  boot.window.pet.getLanguage = () => new Promise(resolve => { resolveInitial = resolve; });
  boot.window.dispatchEvent = event => boot.window.dispatch(event.type);
  boot.sandbox.Event = class { constructor(type) { this.type = type; } };
  vm.createContext(boot.sandbox);
  for (const file of ['shared/messages.js', 'shared/i18n.js', 'renderer/language.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), boot.sandbox);
  }
  push('zh-Hant');
  resolveInitial('en');
  await Promise.resolve();
  await Promise.resolve();
  assert.equal(boot.window.AgentPawI18n.getLanguage(), 'zh-Hant', 'a stale startup response must not undo a language change');
  console.log('Language startup reconciliation keeps the newest preference');
})().catch(error => { console.error(error); process.exitCode = 1; });
