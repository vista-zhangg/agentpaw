'use strict';

// Sound and system notifications for events that already passed the muting and
// intensity rules in task-notifications.js. Sound answers "look up now"; a
// system notification only stands in when the companion window cannot be seen.

const SOUND_GAP_MS = 3000;
const TOAST_GAP_MS = 30000;
const ATTENTION_KINDS = new Set(['waiting', 'needsinput', 'error']);
const DONE_KIND = 'completion-summary';

function createAlerts({ getPreferences, getSurface, isPrivate, playSound, showToast, describe, now = Date.now }) {
  let lastSoundAt = -Infinity;
  const lastToastAt = new Map();

  function category(event) {
    if (!event || event.silent) return null;
    if (ATTENTION_KINDS.has(event.kind)) return 'attention';
    return event.kind === DONE_KIND ? 'done' : null;
  }

  function toastDue(event) {
    const key = `${event.kind}:${event.sessionId || ''}`;
    const at = now();
    if (at - (lastToastAt.get(key) ?? -Infinity) < TOAST_GAP_MS) return false;
    for (const [old, time] of lastToastAt) if (at - time >= TOAST_GAP_MS) lastToastAt.delete(old);
    lastToastAt.set(key, at);
    return true;
  }

  return {
    handle(event) {
      const kind = category(event);
      if (!kind) return;
      const prefs = getPreferences();
      if (kind === 'done' && !prefs.alertOnDone) return;
      const surface = getSurface();
      if (surface.quiet) return;
      if (prefs.sound && !surface.fullscreen && !surface.locked && now() - lastSoundAt >= SOUND_GAP_MS) {
        lastSoundAt = now();
        playSound(kind);
      }
      if (prefs.systemNotifications && !surface.visible && toastDue(event)) {
        showToast(describe(event, isPrivate()));
      }
    },
  };
}

module.exports = { createAlerts, SOUND_GAP_MS, TOAST_GAP_MS };
