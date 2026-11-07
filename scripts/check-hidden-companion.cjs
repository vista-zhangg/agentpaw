'use strict';

const assert = require('assert');

// With the companion switched off the capsule carries every interaction. Check
// the real renderer with the capsule at its fullest and emptiest, above and
// below the anchor: nothing may be clipped, covered or lose its click target.
const DISPLAYS = {
  capsule: { showCat: false, showStatus: false, showQuota: true, showTokens: true, showCost: false },
  empty: { showCat: false, showStatus: false, showQuota: false, showTokens: false, showCost: false },
};
const PERMISSION = { kind: 'perm', permId: 'hidden-perm', sessionId: 'demo1', project: 'AgentPaw', header: 'Bash',
  question: 'npm test', options: [{ key: 'allow', label: 'Allow' }, { key: 'deny', label: 'Deny' }] };
const PLAN = { ...PERMISSION, kind: 'plan', permId: 'hidden-plan', question: Array.from({ length: 30 }, (_, i) => `${i + 1}. Step`).join('\n') };
const QUESTION = { kind: 'ask', permId: 'hidden-question', sessionId: 'demo1', project: 'AgentPaw',
  questions: [{ header: 'Mode', question: 'Which one?', options: [{ label: 'One', description: 'First' }, { label: 'Two', description: 'Second' }] }] };

const INSPECT = `const box = el => { const r = el.getBoundingClientRect();
    return { w: r.width, h: r.height, inside: r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight }; };
  const clear = (el, other) => { const a = el.getBoundingClientRect(), b = other.getBoundingClientRect();
    return a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top; };
  const hits = el => { const r = el.getBoundingClientRect(); updateMouseHit(r.left + r.width / 2, r.top + r.height / 2); return !mouseIgnoring; };`;

module.exports = async function checkHiddenCompanion(pet, { capture, log }) {
  const run = code => pet.webContents.executeJavaScript(code);
  const settle = () => new Promise(resolve => setTimeout(resolve, 80));
  pet.setSize(520, 740);
  await run(`window.previewHiddenY = Object.getOwnPropertyDescriptor(window, 'screenY'); void 0;`);
  for (const [name, display] of Object.entries(DISPLAYS)) {
    for (const vertical of ['above', 'below']) {
      const label = `${name}-${vertical}`;
      await run(`closeActionPop(); hideBubble(); askQueue = []; askIdx = 0; elic = null; hideAsk && hideAsk();
        Object.defineProperty(window, 'screenY', { configurable: true, value: ${vertical === 'above' ? 1000 : 0} });
        setStageEdgeLayout({ vertical: '${vertical}', horizontal: 'center' });
        applyStats({ ...lastStats, actions: [], chipDisplay: ${JSON.stringify(display)} }); void 0;`);
      await settle();

      const capsule = await run(`(() => { ${INSPECT} return { box: box(chip), hit: hits(chip), hidden: document.getElementById('cat').getAttribute('aria-hidden') }; })()`);
      assert.equal(capsule.hidden, 'true', label + ': companion is hidden');
      assert(capsule.box.w >= 12 && capsule.box.h >= 12 && capsule.box.inside, label + ': capsule stays visible: ' + JSON.stringify(capsule));
      assert(capsule.hit, label + ': capsule accepts the pointer');

      await run(`handleCatClick(); void 0;`);
      await settle();
      const quick = await run(`(() => { ${INSPECT} return { open: actionPopOpen, box: box(actionPop), hit: hits(actionPop), clear: clear(actionPop, chip) }; })()`);
      assert(quick.open && quick.box.inside && quick.hit && quick.clear, label + ': left click opens the quick view: ' + JSON.stringify(quick));
      await run(`closeActionPop(); void 0;`);

      for (const [scene, choice] of [['permission', PERMISSION], ['plan', PLAN], ['question', QUESTION]]) {
        await run(`askQueue = [${JSON.stringify(choice)}]; askIdx = 0; elic = null; showAskPanel(); void 0;`);
        await settle();
        const ask = await run(`(() => { ${INSPECT}
          const buttons = [...askEl.querySelectorAll('button')].filter(el => el.getClientRects().length);
          return { box: box(askEl), hit: hits(askEl), clear: clear(askEl, chip), buttons: buttons.length, buttonsInside: buttons.filter(el => !askScroll.contains(el)).every(el => box(el).inside), scrollable: !buttons.some(el => askScroll.contains(el) && !box(el).inside) || askScroll.scrollHeight > askScroll.clientHeight }; })()`);
        assert(ask.box.h > 0 && ask.box.inside && ask.hit && ask.clear && ask.buttons > 0 && ask.buttonsInside && ask.scrollable, `${label} ${scene}: card is usable: ` + JSON.stringify(ask));
        if (vertical === 'above') await capture(pet, `pet-hidden-${name}-${scene}`);
        await run(`askQueue = []; askIdx = 0; hideAsk && hideAsk(); void 0;`);
        await settle();
      }

      await run(`showBubble('Task finished: details stay near the capsule', 5000, true); void 0;`);
      await settle();
      const speech = await run(`(() => { ${INSPECT} return { box: box(bubble), clear: clear(bubble, chip) }; })()`);
      assert(speech.box.h > 0 && speech.box.inside && speech.clear, label + ': bubble is visible and clear of the capsule: ' + JSON.stringify(speech));
      if (vertical === 'above') await capture(pet, `pet-hidden-${name}-bubble`);
      await run(`hideBubble(); void 0;`);

      if (display.showQuota) {
        await run(`document.getElementById('chip-quota').click(); void 0;`);
        await settle();
        const quota = await run(`(() => { ${INSPECT} return { open: quotaPopoverOpen, box: box(quotaPopover), hit: hits(quotaPopover), clear: clear(quotaPopover, chip) }; })()`);
        assert(quota.open && quota.box.inside && quota.hit && quota.clear, label + ': quota card opens: ' + JSON.stringify(quota));
        await run(`closeQuotaPopover(); void 0;`);
      }
    }
  }
  await run(`Object.defineProperty(window, 'screenY', window.previewHiddenY); delete window.previewHiddenY; void 0;`);
  log('Hidden companion: capsule, quick view, approval, plan, question, bubble and quota checks passed');
};
