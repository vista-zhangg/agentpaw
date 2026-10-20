'use strict';

// Codex quota card shared by the detail panel and the pet's quota popover:
// remaining share, reset countdown, hatched projection and the forecast note.
(function (root) {
  const t = (key, vars) => root.AgentPawI18n.t(key, vars);
  const text = (source, args) => root.AgentPawI18n.text(source, args);
  const lang = () => root.AgentPawI18n.getLanguage();

  function el(tag, className, content) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (content != null) node.textContent = content;
    return node;
  }
  function durationText(ms) {
    const minutes = Math.max(1, Math.ceil(Math.max(0, ms) / 60000));
    if (minutes < 60) return t('quota.durationMinutes', { count: minutes });
    const hours = Math.floor(minutes / 60), restMinutes = minutes % 60;
    if (hours < 24) return restMinutes ? t('quota.durationHoursMinutes', { hours, minutes: restMinutes }) : t('quota.durationHours', { count: hours });
    const days = Math.floor(hours / 24), restHours = hours % 24;
    return restHours ? t('quota.durationDaysHours', { days, hours: restHours }) : t('quota.durationDays', { count: days });
  }
  function clockText(ms) {
    return new Date(ms).toLocaleTimeString(lang(), { hour: '2-digit', minute: '2-digit', hour12: false });
  }
  function remaining(w) {
    if (!w || typeof w !== 'object') return null;
    if (Number.isFinite(w.remainingPercent)) return Math.max(0, Math.min(100, Number(w.remainingPercent)));
    return Number.isFinite(w.usedPercent) ? Math.max(0, Math.min(100, 100 - Number(w.usedPercent))) : null;
  }
  function windows(quota) {
    const all = quota && quota.windows && typeof quota.windows === 'object' ? quota.windows : {};
    const observed = Array.isArray(quota && quota.observedWindows) ? quota.observedWindows : [];
    // A missing response says nothing about which windows this account has.
    return [['fiveHour', 'quota.fiveHour', '5h'], ['weekly', 'quota.weekly', '7d']]
      .filter(([key]) => key !== 'fiveHour' || remaining(all.fiveHour) !== null || observed.includes('fiveHour'))
      .map(([key, labelKey, short]) => ({ key, label: t(labelKey), short, window: all[key] }));
  }
  // 'amber' also when the recent pace would run out before the reset.
  function level(quota, key) {
    const left = remaining(quota && quota.windows && quota.windows[key]);
    if (left === null) return 'unknown';
    if (left <= 5) return 'red';
    const forecast = quota.forecast && quota.forecast[key];
    if (left <= 20 || (forecast && forecast.status === 'ready' && forecast.exhaustAt)) return 'amber';
    return 'normal';
  }
  function meta(quota) {
    if (!quota || quota.status !== 'ready') return (quota && quota.statusText) || t('quota.unavailable');
    const plan = quota.account && typeof quota.account.planType === 'string' ? quota.account.planType.trim() : '';
    const synced = Number.isFinite(quota.updatedAt) ? text('同步于 {0}', [clockText(quota.updatedAt)]) : '';
    return [plan && plan[0].toUpperCase() + plan.slice(1), synced].filter(Boolean).join(' · ');
  }
  function render(box, quota, { showDate = true } = {}) {
    box.replaceChildren();
    for (const row of windows(quota)) {
      const left = remaining(row.window);
      const item = el('div', 'quota-row');
      item.dataset.level = left === null ? 'unknown' : left <= 5 ? 'red' : left <= 20 ? 'amber' : 'normal';
      const top = el('div', 'quota-top');
      const resetAt = row.window && Number.isFinite(row.window.resetsAt) ? Number(row.window.resetsAt) * 1000 : null;
      const resetText = resetAt == null ? t('quota.resetUnknown')
        : resetAt <= Date.now() ? t('quota.resetSoon')
          : text('{0}后重置', [durationText(resetAt - Date.now())]);
      top.append(el('span', 'quota-label', row.label), el('span', 'quota-value num', left === null ? '--' : Math.round(left) + '%'),
        el('span', 'quota-left', text('剩余')), el('span', 'quota-reset', resetText));
      const bar = el('div', 'quota-bar'), fill = el('i');
      fill.style.width = (left || 0) + '%';
      bar.append(fill);
      item.append(top, bar);
      const forecast = quota.forecast && quota.forecast[row.key];
      if (left !== null && forecast && forecast.status === 'ready') {
        // Hatched: what the recent burn rate would still use before the reset.
        const atReset = Math.max(0, Math.min(left, Number(forecast.remainingAtReset) || 0));
        const projected = el('span', 'proj');
        projected.style.left = atReset + '%';
        projected.style.width = (left - atReset) + '%';
        bar.append(projected);
        const note = el('div', 'quota-note');
        if (forecast.exhaustAt) {
          note.classList.add('warn');
          note.textContent = text('按当前速度约 {0} 用完，比重置早 {1}', [clockText(forecast.exhaustAt), durationText(forecast.earlyMs)]);
          if (item.dataset.level === 'normal') item.dataset.level = 'amber';
        } else {
          note.classList.add('ok');
          note.textContent = text('按当前速度够用，重置时约剩 {0}%', [Math.round(atReset)]);
        }
        note.title = text('近期速度 {0}% / 小时', [forecast.ratePerHour.toFixed(1)]);
        item.append(note);
      }
      if (showDate && resetAt != null) {
        item.append(el('div', 'quota-at', new Date(resetAt).toLocaleString(lang(), { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false })));
      }
      box.append(item);
    }
  }

  root.AgentPawQuotaCard = { render, meta, windows, remaining, level, durationText, clockText };
})(typeof window !== 'undefined' ? window : globalThis);
