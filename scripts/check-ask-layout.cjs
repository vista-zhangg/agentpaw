'use strict';

const assert = require('assert');

// Inspect the actual renderer: hidden controls, option alignment and scrolling
// are the parts that a screenshot of the old permission card exposed.
module.exports = async function checkAskLayout(pet, { capture, log }) {
  const permission = {
    kind: 'perm', permId: 'preview-ask', sessionId: 'session-a7d', project: '[skills-trial] 试跑',
    header: 'Bash', question: '运行命令：\ncd /d/Desktop/TW-Steel/projects/skills-trial &&\nPY=/c/Users/77723/.local/bin/python npm test',
    options: [{ key: 'allow', label: '允许' }, { key: 'deny', label: '拒绝' }],
  };
  const question = {
    kind: 'ask', permId: 'preview-question', sessionId: 'session-a7d', project: 'AgentPaw',
    questions: [{ header: '交互方式', question: '希望如何处理任务提醒？', options: [
      { label: '只提醒需要处理的任务', description: '保留授权、失败和完成提醒，减少工作中的打扰。' },
      { label: '显示全部动态', description: '显示每一次任务状态变化。' },
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
    ['permission-remember', { ...permission, options: [...permission.options, { key: 'always', label: '始终允许这个操作' }] }],
    ['question', question],
    ['question-multi', { ...question, questions: [{ ...question.questions[0], multiSelect: true }] }],
    ['plan', { ...permission, kind: 'plan', question: Array.from({length:35}, (_,i) => `${i+1}. 统一授权卡片、标题与操作按钮的视觉风格，并检查长内容滚动。`).join('\n') }],
    ['continue', { kind: 'continue', sessionId: 'session-a7d', project: 'AgentPaw', question: '任务需要补充信息，请到当前会话继续回复。' }],
  ]) {
    pet.setSize(520, 740);
    await show(choice);
    if (choice.kind === 'ask') {
      await pet.webContents.executeJavaScript(`askOpts.lastElementChild.click(); askText.value='只在需要处理时提醒'; askText.dispatchEvent(new Event('input')); void 0;`);
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
  await show({ ...permission, project: '很长的项目名称 / ' + 'skills-trial/'.repeat(8) });
  await capture(pet, 'pet-ask-permission-narrow');
  const narrow = await inspect();
  assert(narrow.inBounds && narrow.footerFits && !narrow.overflow, 'long project and command fit a narrow viewport');
  await pet.webContents.executeJavaScript(`hideAsk(); askQueue=[]; elic=null; void 0;`);
  pet.setSize(520, 740);
  log('Ask cards: permissions, custom single/multiple answers, scrolling plan, terminal reply and narrow viewport passed');
};
