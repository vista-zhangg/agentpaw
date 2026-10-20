'use strict';

// Ask card: who is asking, queue position, keyboard and the plan's Markdown view.
const assert = require('assert');
const vm = require('vm');
const { loadRenderer } = require('./dom-stub');

const w = loadRenderer(['shared/i18n.js', 'shared/states.js', 'shared/pet-assets.js',
  'shared/pet-insights.js', 'renderer/pet.js', 'renderer/quick-view.js']);
const { elements, handlers, calls, document, sandbox } = w;
const perm = (id, agent = 'codex') => ({
  kind: 'perm', permId: 'perm-' + id, sessionId: 'session-' + id, agent, project: 'p-' + id,
  header: 'Bash', question: '运行命令：npm test',
  options: [{ key: 'allow', label: '允许' }, { key: 'deny', label: '拒绝' }],
});
const stats = (choices) => ({
  today: {}, waitingCount: choices.length,
  sessions: choices.map(c => ({ sessionId: c.sessionId, agent: c.agent, project: c.project, state: 'waiting', choice: c })),
  actions: choices.map(c => ({ actionId: c.permId, sessionId: c.sessionId, state: 'waiting', choice: c })),
});
const flush = async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); };

(async () => {
  handlers.stats(stats([perm('a'), perm('b', 'claude')]));
  assert.equal(elements('ask').classList.contains('hidden'), false, 'an approval pops up on its own');
  assert.equal(elements('ask-sess').textContent, 'Codex · p-a', 'the card names the tool and project, without a session code');
  assert.equal(elements('ask-queue').textContent, '待办 1 / 2', 'the queue position sits apart from the question');
  const allow = elements('ask-opts').children.find(card => card.className.includes('allow'));
  assert(allow.innerHTML.includes('Enter'), 'allow carries its key');
  const deny = elements('ask-opts').children.find(card => card.className.includes('deny'));
  assert(!deny.innerHTML.includes('kbd'), 'deny is not bound to a key');

  document.dispatch('keydown', { key: 'Enter', target: null, preventDefault() {} });
  await flush();
  const decided = calls.filter(([name]) => name === 'decidePermission');
  assert.deepEqual(decided.map(([, args]) => [args[0], args[1]]), [['perm-a', 'allow']], 'Enter allows the current permission');

  handlers.stats(stats([perm('b', 'claude')]));
  await flush();
  assert.equal(elements('ask-sess').textContent, 'Claude · p-b');
  document.dispatch('keydown', { key: 'Escape', target: null, preventDefault() {} });
  assert.equal(elements('ask').classList.contains('hidden'), true, 'Esc puts the card away for later');
  assert.equal(calls.filter(([name]) => name === 'decidePermission').length, 1, 'Esc decides nothing');
  assert.equal(elements('np-badge').textContent, 1, 'the item stays on the capsule count');

  const html = vm.runInContext(`markdownHtml(${JSON.stringify([
    '## 步骤', '1. 改 `pet.css`', '2. **跑** 测试', '', '- 不做 *动画*', '```', '<script>x</script>', '```', '<img src=x onerror=alert(1)>',
  ].join('\n'))})`, sandbox);
  assert(html.includes('<h5>步骤</h5>'), 'headings render one level down inside the card');
  assert(html.includes('<ol><li>改 <code>pet.css</code></li><li><b>跑</b> 测试</li></ol>'), 'ordered list with inline code and bold');
  assert(html.includes('<ul><li>不做 <i>动画</i></li></ul>'), 'bullet list with italic');
  assert(html.includes('<pre><code>&lt;script&gt;x&lt;/script&gt;</code></pre>'), 'code blocks are escaped');
  assert(html.includes('<p>&lt;img src=x onerror=alert(1)&gt;</p>') && !/<img|<script/.test(html), 'raw HTML never passes through');

  const plan = { kind: 'plan', permId: 'perm-plan', sessionId: 'session-plan', agent: 'claude', project: 'p-plan',
    question: 'plain', markdown: '# 计划\n- 一步', options: [{ key: 'allow', label: '批准方案' }], allowInput: true };
  handlers.stats(stats([plan]));
  vm.runInContext('askQueue = [lastStats.actions[0].choice]; askIdx = 0; showAskPanel()', sandbox);
  assert(elements('ask-q').classList.contains('md'), 'plans use the Markdown view');
  assert(elements('ask-q').innerHTML.includes('<li>一步</li>'));
  assert(elements('ask-opts').classList.contains('perm-row'), 'approve and send back sit side by side');
  console.log('ask card header, queue, keyboard and Markdown checks passed');
  process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
