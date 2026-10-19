'use strict';

// Projects when each Codex quota window runs out at the recent burn rate.
// Samples come from live rate-limit updates (both windows) and from the weekly
// snapshots Codex writes into its transcripts (weekly only). Nothing is
// persisted: the 5-hour window simply collects again after a restart.

const WINDOWS = Object.freeze({
  fiveHour: { lookbackMs: 60 * 60 * 1000, minSpanMs: 15 * 60 * 1000, durationMs: 5 * 60 * 60 * 1000 },
  weekly: { lookbackMs: 24 * 60 * 60 * 1000, minSpanMs: 2 * 60 * 60 * 1000, durationMs: 7 * 24 * 60 * 60 * 1000 },
});
// resets_at can drift by seconds between responses; a real reset moves it by hours.
const RESET_TOLERANCE_SECONDS = 5 * 60;
const MAX_SAMPLES = 2000;
const finite = value => typeof value === 'number' && Number.isFinite(value) ? value : null;

function usedOf(window) {
  const used = finite(window && window.usedPercent);
  if (used !== null) return used;
  const remaining = finite(window && window.remainingPercent);
  return remaining === null ? null : 100 - remaining;
}

function createQuotaForecaster() {
  const samples = { fiveHour: [], weekly: [] };
  const seen = { fiveHour: new Set(), weekly: new Set() };
  const cycle = { fiveHour: null, weekly: null };

  function add(key, at, used, resetsAt) {
    if (finite(at) === null || used === null || used < 0 || used > 100) return;
    const list = samples[key];
    // A different reset time is a new cycle: earlier samples no longer apply.
    if (cycle[key] === null || Math.abs(cycle[key] - resetsAt) > RESET_TOLERANCE_SECONDS) {
      cycle[key] = resetsAt;
      list.length = 0;
      seen[key].clear();
    }
    if (seen[key].has(at)) return;
    seen[key].add(at);
    const outOfOrder = list.length > 0 && list[list.length - 1].at > at;
    list.push({ at, used });
    if (outOfOrder) list.sort((a, b) => a.at - b.at);
    if (list.length > MAX_SAMPLES) {
      for (const row of list.splice(0, list.length - MAX_SAMPLES)) seen[key].delete(row.at);
    }
  }

  function forecast(key, window, now) {
    const spec = WINDOWS[key];
    const resetsAt = finite(window && window.resetsAt);
    const used = usedOf(window);
    if (resetsAt === null || used === null || resetsAt * 1000 <= now) return null;
    const list = samples[key].filter(row => row.at <= now && row.at >= now - spec.lookbackMs);
    if (list.length < 2) return { status: 'collecting' };
    const first = list[0], last = list[list.length - 1];
    const span = last.at - first.at;
    // A drop inside one cycle is a manual reset or a stale read; wait for new data.
    if (span < spec.minSpanMs || last.used < first.used) return { status: 'collecting' };
    const ratePerHour = (last.used - first.used) / span * 3600e3;
    const remaining = Math.max(0, 100 - used);
    const resetAtMs = resetsAt * 1000;
    const exhaustAt = ratePerHour > 0 ? now + remaining / ratePerHour * 3600e3 : null;
    const runsOut = exhaustAt !== null && exhaustAt < resetAtMs;
    return {
      status: 'ready',
      ratePerHour,
      exhaustAt: runsOut ? Math.round(exhaustAt) : null,
      earlyMs: runsOut ? Math.round(resetAtMs - exhaustAt) : 0,
      remainingAtReset: runsOut ? 0 : Math.max(0, remaining - ratePerHour * (resetAtMs - now) / 3600e3),
      basisMs: span,
    };
  }

  // state: the live codexQuotaState; history: codex-metering quota events.
  function observe(state, history = [], now = Date.now()) {
    const windows = state && state.status === 'ready' && state.windows ? state.windows : {};
    const at = finite(state && state.updatedAt) ?? now;
    const out = {};
    for (const key of Object.keys(WINDOWS)) {
      const window = windows[key];
      const resetsAt = finite(window && window.resetsAt);
      if (resetsAt === null) continue;
      if (key === 'weekly' && Array.isArray(history)) {
        const since = now - WINDOWS.weekly.lookbackMs;
        for (const row of history) {
          // Only the lookback window feeds the rate; older events are skipped cheaply.
          if (!row || !(row.at >= since)) continue;
          const rowReset = finite(row.resetsAt);
          // Transcript snapshots may belong to another limit bucket.
          if (window.windowId && `${row.limitId || 'codex'}:10080` !== window.windowId) continue;
          if (rowReset !== null && Math.abs(rowReset - resetsAt) <= RESET_TOLERANCE_SECONDS) add(key, finite(row.at), finite(row.usedPercent), resetsAt);
        }
      }
      add(key, at, usedOf(window), resetsAt);
      const result = forecast(key, window, now);
      if (result) out[key] = result;
    }
    return out;
  }

  return { observe };
}

module.exports = { createQuotaForecaster, WINDOWS };
