'use strict';

// Shared translations, placeholders and source-key coverage.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const i18n = require('../shared/i18n');
const config = require('../backend/config');

const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const PLACEHOLDER = /\{(\w+)\}/g;

assert.deepStrictEqual(Object.keys(i18n.DICT), ['en', 'zh-Hans', 'zh-Hant']);
i18n.setLanguage('zh-Hans');
const zhKeys = Object.keys(i18n.DICT['zh-Hans']).sort();
assert(zhKeys.length > 150, 'zh dictionary looks truncated');
assert(!('lang.zh' in i18n.DICT['zh-Hans']) && !('menu.mute' in i18n.DICT['zh-Hans']) && !('dlg.later' in i18n.DICT['zh-Hans']), 'removed settings must not leave dictionary keys');
assert.strictEqual(config.DEFAULTS.language, 'en');
assert.strictEqual(config.sanitize({ language: 'invalid' }).language, 'en');
assert.strictEqual(config.sanitize({ language: 'zh-Hant' }).language, 'zh-Hant');

for (const key of zhKeys) {
  const value = i18n.DICT['zh-Hans'][key];
  assert.strictEqual(typeof value, 'string', `${key} must be a string`);
  const placeholders = value.match(PLACEHOLDER) || [];
  assert.deepStrictEqual(i18n.t(key, Object.fromEntries(placeholders.map((p) => [p.slice(1, -1), 'x']))), value.replace(PLACEHOLDER, 'x'),
    `${key} placeholders must be substituted`);
}

const SOURCES = [
  'main.js', 'backend/adapter.js', 'backend/privacy.js', 'renderer/pet.js', 'renderer/panel.js',
  'renderer/settings.js',
];
const DOTTED = /^[a-z]+\.[A-Za-z]\w*$/;
const usedKeys = new Set();
const collect = (re, src) => {
  for (const m of src.matchAll(re)) if (DOTTED.test(m[1])) usedKeys.add(m[1]);
};
for (const file of SOURCES) {
  const src = read(file);
  collect(/\bt\(\s*'([\w.]+)'/g, src);
  collect(/(?:labelKey|key):\s*'([\w.]+)'/g, src);
}
for (const file of ['renderer/pet.html', 'renderer/panel.html', 'renderer/settings.html']) {
  collect(/data-i18n(?:-title|-ph)?="([^"]+)"/g, read(file));
}
assert(usedKeys.size > 100, `key scan found suspiciously few usages: ${usedKeys.size}`);
const unknown = [...usedKeys].filter((key) => !(key in i18n.DICT['zh-Hans']));
assert.deepStrictEqual(unknown, [], `t() uses keys absent from the dictionary: ${unknown.join(', ')}`);

for (const suffix of ['reply', 'plan', 'perm', 'default']) {
  for (const family of ['wait.', 'reason.']) {
    assert(family + suffix in i18n.DICT['zh-Hans'], `missing ${family}${suffix}`);
  }
}
for (const tool of ['Edit', 'Write', 'NotebookEdit', 'Read', 'Bash', 'Grep', 'Glob',
  'WebSearch', 'WebFetch', 'Task', 'TodoWrite', 'Js', 'Wait', 'default']) {
  assert('tool.' + tool in i18n.DICT['zh-Hans'], `missing tool.${tool}`);
}

assert.strictEqual(i18n.backgroundStatus({ backgroundTasksCount: 2 }), '后台任务 2 项');
assert.strictEqual(i18n.backgroundStatus({ sessionCronsCount: 1 }), '定时等待 1 项');
assert.strictEqual(i18n.backgroundStatus({ backgroundTasksCount: 2, sessionCronsCount: 1 }), '后台 2 项 · 定时 1 项');
assert.strictEqual(i18n.backgroundStatus({ backgroundTasksCount: -1, sessionCronsCount: NaN }), '');
assert.strictEqual(i18n.t('no.such.key'), 'no.such.key', 'unknown key must degrade to the key');
console.log('i18n checks passed');

const messages = require('../shared/messages');
const placeholders = value => [...new Set(value.match(/\{\w+\}/g) || [])].sort();
for (const [source, english, traditional] of messages) {
  assert(english && traditional, 'all supported languages must have a translation: ' + source);
  assert.deepStrictEqual(placeholders(english), placeholders(source), 'English placeholders: ' + source);
  assert.deepStrictEqual(placeholders(traditional), placeholders(source), 'Traditional placeholders: ' + source);
  if (!source.startsWith('原作者：')) assert(!/[\u3400-\u9fff]/.test(english), 'untranslated English: ' + source);
}
for (const locale of i18n.LANGUAGES) {
  assert.deepStrictEqual(Object.keys(i18n.DICT[locale]).sort(), zhKeys);
  i18n.setLanguage(locale);
  assert.equal(i18n.getLanguage(), locale);
}
i18n.setLanguage('en');
assert.equal(i18n.t('settings.title'), 'AgentPaw · Settings');
assert.equal(i18n.text('上下文 {0}%', [37]), 'Context 37%');
assert.equal(i18n.text('会话', { count: 1 }), 'Session');
i18n.setLanguage('zh-Hant');
assert.equal(i18n.t('settings.title'), 'AgentPaw · 設定');
assert.equal(i18n.text('缓存读取'), '快取讀取');
i18n.setLanguage('invalid');
assert.equal(i18n.getLanguage(), 'en');
