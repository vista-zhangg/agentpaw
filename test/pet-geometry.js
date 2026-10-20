'use strict';

const assert = require('assert');
const geometry = require('../shared/pet-geometry');

const workArea = { x: 0, y: 24, width: 1440, height: 876 };

// Old saved positions put the transparent window at the top while the visible
// pet remained around its bottom. That must be interpreted as a top-edge drag.
assert.deepStrictEqual(
  geometry.chooseRestingLayout({
    workArea,
    windowRect: { x: 900, y: 24, width: 320, height: 340 },
    petRect: { x: 100, y: 160, width: 120, height: 140 },
    current: { vertical: 'above', horizontal: 'center' },
  }),
  { vertical: 'below', horizontal: 'center' },
  'top-clamped legacy positions must move the visible pet to the window top',
);

assert.strictEqual(
  geometry.choosePopupLayout({
    workArea,
    windowRect: { x: 900, y: 24, width: 320, height: 340 },
    petRect: { x: 100, y: 0, width: 120, height: 140 },
    current: { vertical: 'below', horizontal: 'center' },
    popupHeight: 360,
  }).vertical,
  'below',
  'a popup opened at the top edge must grow below the pet',
);

assert.strictEqual(
  geometry.chooseRestingLayout({
    workArea,
    windowRect: { x: 900, y: 280, width: 320, height: 340 },
    petRect: { x: 100, y: 0, width: 120, height: 140 },
    current: { vertical: 'below', horizontal: 'center' },
  }).vertical,
  'above',
  'leaving the top zone must restore bubbles and status above the pet',
);

assert.strictEqual(
  geometry.chooseRestingLayout({
    workArea,
    windowRect: { x: 900, y: 190, width: 320, height: 340 },
    petRect: { x: 100, y: 0, width: 120, height: 140 },
    current: { vertical: 'below', horizontal: 'center' },
    threshold: 216,
  }).vertical,
  'below',
  'pointerup must not restore the above layout before its real inset fits',
);

assert.deepStrictEqual(
  geometry.chooseRestingLayout({
    workArea,
    windowRect: { x: 460, y: 24, width: 520, height: 760 },
    petRect: { x: 200, y: 480, width: 120, height: 120 },
    current: { vertical: 'above', horizontal: 'center' },
    threshold: 218,
    inferVerticalFrameClamp: false,
    inferHorizontalFrameClamp: false,
  }),
  { vertical: 'above', horizontal: 'center' },
  'a tall popup clamped to the screen top must not masquerade as a pet edge drag',
);

assert.strictEqual(
  geometry.chooseDragVerticalLayout({
    current: 'above', workArea, targetWindowY: 24, petScreenY: 204, abovePetOffset: 180,
  }),
  'below',
  'dragging the transparent frame into the top boundary must switch before pointerup',
);

assert.strictEqual(
  geometry.chooseDragVerticalLayout({
    current: 'below', workArea, targetWindowY: 80, petScreenY: 80, abovePetOffset: 180,
  }),
  'below',
  'the top layout stays below while a normal above frame would still be off-screen',
);

assert.strictEqual(
  geometry.chooseDragVerticalLayout({
    current: 'below', workArea, targetWindowY: 220, petScreenY: 220, abovePetOffset: 180,
  }),
  'above',
  'dragging back into the desktop restores the normal above layout during the gesture',
);

assert.strictEqual(
  geometry.choosePopupLayout({
    workArea,
    windowRect: { x: 900, y: 560, width: 320, height: 340 },
    petRect: { x: 100, y: 180, width: 120, height: 140 },
    current: { vertical: 'above', horizontal: 'center' },
    popupHeight: 360,
  }).vertical,
  'above',
  'a popup opened at the bottom edge must stay above the pet',
);

assert.strictEqual(
  geometry.choosePopupLayout({
    workArea,
    windowRect: { x: 700, y: 24, width: 520, height: 624 },
    petRect: { x: 200, y: 309, width: 120, height: 120 },
    current: { vertical: 'above', horizontal: 'center' },
    popupHeight: 310,
  }).vertical,
  'below',
  'one pixel less than the fixed panel height must flip the panel below',
);

assert.strictEqual(
  geometry.choosePopupLayout({
    workArea,
    windowRect: { x: 700, y: 24, width: 520, height: 624 },
    petRect: { x: 200, y: 310, width: 120, height: 120 },
    current: { vertical: 'below', horizontal: 'center' },
    popupHeight: 310,
  }).vertical,
  'above',
  'at exactly one panel height from the top, the panel must return above',
);

console.log('pet edge geometry checks passed');
