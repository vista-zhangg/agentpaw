(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AgentPawUsage = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const fields = ['tokens', 'cost', 'messages', 'inputTotal', 'output', 'cacheRead', 'cacheWrite', 'cacheWrite5m', 'cacheWrite1h', 'cacheWriteUnspecified', 'reasoningOutput'];
  // Every range ends on its last day (today unless a single day is selected).
  const RANGE_DAYS = Object.freeze({ today: 1, day: 1, '7d': 7, '30d': 30, '90d': 90 });
  // Provider ledgers retain this many calendar days (see metering DAILY_KEEP_DAYS).
  const RETAINED_DAYS = 95;
  const num = value => Number.isFinite(Number(value)) && Number(value) > 0 ? Number(value) : 0;
  function dayKey(value) {
    const d = value instanceof Date ? value : new Date(value);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function offset(key, days) {
    const [y, m, d] = key.split('-').map(Number);
    return dayKey(new Date(y, m - 1, d + days, 12));
  }
  function sum(rows) {
    const out = Object.fromEntries(fields.map(key => [key, 0]));
    out.known = rows.length > 0;
    out.detailComplete = rows.length > 0 && rows.every(row => row.detailComplete === true);
    for (const row of rows) for (const key of fields) out[key] += num(row[key]);
    out.cacheRate = out.detailComplete && out.inputTotal > 0 ? out.cacheRead / out.inputTotal * 100 : null;
    out.normalInput = out.detailComplete ? out.inputTotal - out.cacheRead - out.cacheWrite : null;
    return out;
  }
  function sources(data, source = 'all') {
    return (data?.sources || []).filter(row => source === 'all' || row.id === source);
  }
  function daysBetween(start, end) {
    const out = [];
    for (let day = start; day <= end && out.length < 366; day = offset(day, 1)) out.push(day);
    return out;
  }
  function gather(scoped, keys) {
    return sum(scoped.flatMap(source => keys.flatMap(key => source.daily[key] ? [source.daily[key]] : [])));
  }
  function selection(data, state) {
    const today = dayKey(data.asOf);
    const range = RANGE_DAYS[state.range] ? state.range : 'today';
    const count = RANGE_DAYS[range];
    const end = range === 'day' && state.day ? state.day : today;
    const start = offset(end, 1 - count);
    const keys = daysBetween(start, end);
    const scoped = sources(data, state.source);
    // Compare complete days only: today is still running, so it is left out of
    // both sides and every remaining day is matched with the same position of
    // the previous period. A previous period outside retention is not compared.
    const compareKeys = keys.filter(key => key !== today);
    const previousKeys = compareKeys.map(key => offset(key, -count));
    const compareCurrent = gather(scoped, compareKeys), previous = gather(scoped, previousKeys);
    const comparable = compareKeys.length > 0
      && previousKeys[0] >= offset(today, 1 - RETAINED_DAYS)
      && compareCurrent.known && previous.known
      && !scoped.some(source => source.unavailable);
    return {
      range, start, end, keys, today, current: gather(scoped, keys),
      compareKeys, previousKeys, compareCurrent, previous, comparable,
      recordedDays: keys.filter(key => scoped.some(source => source.daily[key])).length,
      bySource: scoped.map(source => ({ id: source.id, name: source.label, ...gather([source], keys) })).filter(row => row.known),
      byModel: models(scoped, keys),
    };
  }
  function models(scoped, keys) {
    const groups = new Map();
    function add(id, name, tokens, cost) {
      const row = groups.get(id) || { id, name, tokens: 0, cost: 0, known: true };
      row.tokens += num(tokens); row.cost += num(cost); groups.set(id, row);
    }
    for (const source of scoped) for (const key of keys) {
      const day = source.daily[key];
      if (!day) continue;
      const entries = Object.entries(source.modelsByDay[key] || {});
      const tokens = entries.reduce((n, [, row]) => n + num(row.tokens), 0);
      const cost = entries.reduce((n, [, row]) => n + num(row.cost), 0);
      // Older views can lag their daily ledger. Do not invent negative
      // residuals or display shares whose sum exceeds the period total.
      if (tokens > day.tokens || cost > day.cost + 1e-8) {
        add('missing:', '模型明细缺失', day.tokens, day.cost);
        continue;
      }
      for (const [name, row] of entries) add('model:' + name, name, row.tokens, row.cost);
      if (day.tokens > tokens || day.cost - cost > 1e-8) add('missing:', '模型明细缺失', day.tokens - tokens, Math.max(0, day.cost - cost));
    }
    return [...groups.values()];
  }
  // One bucket per day of the selection, split by source and by model, for the trend chart.
  function daily(data, sel, source = 'all') {
    const scoped = sources(data, source);
    return sel.keys.map(key => ({
      key, live: key === sel.today,
      total: gather(scoped, [key]),
      bySource: Object.fromEntries(scoped.filter(row => row.daily[key]).map(row => [row.id, row.daily[key]])),
      byModel: Object.fromEntries(models(scoped, [key]).map(row => [row.id, row])),
    }));
  }
  function change(current, previous) {
    if (!(previous > 0)) return null;
    const pct = (current - previous) / previous * 100;
    return Math.abs(pct) < .5 ? '持平' : `${pct > 0 ? '↑' : '↓'} ${Math.abs(pct) >= 10 ? Math.round(Math.abs(pct)) : Math.abs(pct).toFixed(1)}%`;
  }
  return { RANGE_DAYS, RETAINED_DAYS, num, dayKey, offset, sum, sources, selection, models, daily, change };
});
