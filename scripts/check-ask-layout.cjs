'use strict';

const assert = require('assert');

// Inspect the actual renderer: hidden controls, option alignment and scrolling
// are the parts that a screenshot of the old permission card exposed.
// Demo content only: the screenshots are published, so never use real paths or accounts.
const DEMO = {
  en: {
    command: 'Run command:\ncd ~/code/web-shop &&\nnpm run test -- --coverage',
    allow: 'Allow', deny: 'Deny', always: 'Always allow this action',
    header: 'Reminders', question: 'How should task reminders behave?',
    quiet: ['Only tasks that need me', 'Keep approvals, failures and completions; fewer interruptions.'],
    all: ['Show every update', 'Show each task state change.'], typed: 'Only when something needs me',
    plan: i => `${i}. Align approval cards, titles and action buttons, then check long content scrolling.`,
    reply: 'The task needs more information; continue in the current session.', longName: 'A very long project name / ',
  },
  zh: {
    command: '运行命令：\ncd ~/code/web-shop &&\nnpm run test -- --coverage',
    allow: '允许', deny: '拒绝', always: '始终允许这个操作',
    header: '交互方式', question: '希望如何处理任务提醒？',
    quiet: ['只提醒需要处理的任务', '保留授权、失败和完成提醒，减少工作中的打扰。'],
    all: ['显示全部动态', '显示每一次任务状态变化。'], typed: '只在需要处理时提醒',
    plan: i => `${i}. 统一授权卡片、标题与操作按钮的视觉风格，并检查长内容滚动。`,
    reply: '任务需要补充信息，请到当前会话继续回复。', longName: '很长的项目名称 / ',
  },
};

module.exports = async function checkAskLayout(pet, { capture, log, language = 'en' }) {
  const demo = DEMO[String(language).startsWith('zh') ? 'zh' : 'en'];
  const permission = {
    kind: 'perm', permId: 'preview-ask', sessionId: 'session-a7d', project: 'web-shop',
    header: 'Bash', question: demo.command,
    options: [{ key: 'allow', label: demo.allow }, { key: 'deny', label: demo.deny }],
  };
  const question = {
    kind: 'ask', permId: 'preview-question', sessionId: 'session-a7d', project: 'AgentPaw',
    questions: [{ header: demo.header, question: demo.question, options: [
      { label: demo.quiet[0], description: demo.quiet[1] },
      { label: demo.all[0], description: demo.all[1] },
    ] }],
  };
  const show = async (choice) => {
    await pet.webContents.executeJavaScript(`closeActionPop(); askQueue=[${JSON.stringify(choice)}]; askIdx=0; elic=null; showAskPanel(); void 0;`);
  };
  const inspect = () => pet.webContents.executeJavaScript(`(() => {
    const rect = askEl.getBoundingClientRect();
    const visible = el => el.getClientRects().length > 0;
    const controls = [...askEl.querySelectorAll('button,input')].filter(visible);
    return {
      inBounds: rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight,
      height: rect.height,
      footerFits: [...askEl.querySelectorAll('.ask-toolbar button')].filter(visible).every(el => {
        const r=el.getBoundingClientRect(); return r.left>=rect.left && r.right<=rect.right && r.bottom<=rect.bottom;
      }),
      controls: controls.map(el => el.id || el.className),
      scrolling: askScroll.scrollHeight > askScroll.clientHeight,
      overflow: askEl.scrollWidth > askEl.clientWidth,
      options: [...askOpts.children].map(el => { const r=el.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width}; }),
    };
  })()`);
  for (const [name, choice] of [
    ['permission', permission],
    ['permission-remember', { ...permission, options: [...permission.options, { key: 'always', label: demo.always }] }],
    ['question', question],
    ['question-multi', { ...question, questions: [{ ...question.questions[0], multiSelect: true }] }],
    ['plan', { ...permission, kind: 'plan', question: Array.from({length:35}, (_,i) => demo.plan(i+1)).join('\n') }],
    ['continue', { kind: 'continue', sessionId: 'session-a7d', project: 'AgentPaw', question: demo.reply }],
  ]) {
    pet.setSize(520, 740);
    await show(choice);
    if (choice.kind === 'ask') {
      await pet.webContents.executeJavaScript(`askOpts.lastElementChild.click(); askText.value=${JSON.stringify(demo.typed)}; askText.dispatchEvent(new Event('input')); void 0;`);
    }
    await capture(pet, 'pet-ask-' + name);
    const layout = await inspect();
    assert(layout.inBounds && layout.footerFits && !layout.overflow, name + ': card and footer stay in bounds: ' + JSON.stringify(layout));
    if (choice.kind === 'perm') {
      assert(!layout.controls.includes('ask-text') && !layout.controls.includes('ask-submit') && !layout.controls.includes('ask-back'), 'permission hides unrelated answer controls');
      if (choice.options.length === 2) assert.equal(layout.options[0].y, layout.options[1].y, 'allow/deny align in one row');
    }
    if (choice.kind === 'plan') assert(layout.scrolling && layout.height <= 521 && layout.controls.includes('ask-text'), 'long plan scrolls while feedback and footer remain available');
    if (choice.kind === 'ask') assert(layout.controls.includes('ask-text') && layout.controls.includes('ask-submit') && !layout.controls.includes('ask-back'), 'custom answers show the input and submit without first-page back');
  }
  pet.setSize(320, 740);
  await show({ ...permission, project: demo.longName + 'web-shop/'.repeat(8) });
  await capture(pet, 'pet-ask-permission-narrow');
  const narrow = await inspect();
  assert(narrow.inBounds && narrow.footerFits && !narrow.overflow, 'long project and command fit a narrow viewport');
  await pet.webContents.executeJavaScript(`hideAsk(); askQueue=[]; elic=null; void 0;`);
  pet.setSize(520, 740);
  log('Ask cards: permissions, custom single/multiple answers, scrolling plan, terminal reply and narrow viewport passed');
};
