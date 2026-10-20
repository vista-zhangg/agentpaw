'use strict';
const $ = id => document.getElementById(id);
const t = (key, vars) => window.AgentPawI18n.t(key, vars);
const backgroundStatus = session => window.AgentPawI18n.backgroundStatus(session);
let lastStats = null;

function render(s) {
  if (!s) return;
  lastStats = s;
  renderUsage(s);
  renderLive(s);
  if (!hasAutoFitted) fitOnce();
}

let hasAutoFitted = false;
let fitRaf = 0;

// 只在首次加载时执行一次高度自适应，之后不再自动调整
// （自动调整会在 stats 周期性更新时反复触发 setBounds，导致窗口拉长/拖动失效）
function fitOnce() {
  if (hasAutoFitted) return;
  if (fitRaf) cancelAnimationFrame(fitRaf);
  fitRaf = requestAnimationFrame(() => {
    fitRaf = 0;
    if (!window.pet || !window.pet.setPanelHeight) return;
    const card = $('card');
    if (!card) return;
    const h = Math.ceil(card.scrollHeight + 14);
    const maxH = Math.floor(window.screen.availHeight * 0.9);
    const finalH = Math.min(Math.max(h, 500), maxH);
    if (finalH > 100) {
      hasAutoFitted = true;
      window.pet.setPanelHeight(finalH);
    }
  });
}

/* ---------- 此刻：额度 ---------- */
function durationText(ms) {
  const minutes = Math.max(1, Math.ceil(Math.max(0, ms) / 60000));
  if (minutes < 60) return t('quota.durationMinutes', { count: minutes });
  const hours = Math.floor(minutes / 60), restMinutes = minutes % 60;
  if (hours < 24) return restMinutes ? t('quota.durationHoursMinutes', { hours, minutes: restMinutes }) : t('quota.durationHours', { count: hours });
  const days = Math.floor(hours / 24), restHours = hours % 24;
  return restHours ? t('quota.durationDaysHours', { days, hours: restHours }) : t('quota.durationDays', { count: days });
}
function renderQuota(quota) {
  const card = window.AgentPawQuotaCard;
  const ready = quota && quota.status === 'ready';
  $('quota-block').hidden = !card.windows(quota).some(row => card.remaining(row.window) !== null) && !ready;
  if ($('quota-block').hidden) return;
  $('quota-meta').textContent = card.meta(quota);
  card.render($('quota-rows'), quota);
}

/* ---------- 此刻：任务 ---------- */
const STATE_META = {
  working: { key: 'state.working', cls: 'st-working' },
  juggling: { key: 'state.juggling', cls: 'st-working' },
  sweeping: { key: 'state.sweeping', cls: 'st-working' },
  thinking: { key: 'state.thinking', cls: 'st-thinking' },
  loafing: { key: 'state.loafing', cls: 'st-idle' },
  waiting: { key: 'state.waiting', cls: 'st-waiting' },
  needsinput: { key: 'state.needsinput', cls: 'st-needsinput' },
  error: { key: 'state.error', cls: 'st-error' },
  done: { key: 'state.done', cls: 'st-done' },
  idle: { key: 'state.idle', cls: 'st-idle' },
  sleeping: { key: 'state.sleeping', cls: 'st-sleeping' },
  greet: { key: 'state.greet', cls: 'st-greet' },
  talking: { key: 'state.talking', cls: 'st-talking' },
};
const BUSY = new Set(['working', 'juggling', 'sweeping', 'thinking']);
const ATTENTION = new Set(['waiting', 'needsinput']);

const AGENT_NAME = { claude: 'Claude', codex: 'Codex', workbuddy: 'WorkBuddy', opencode: 'opencode' };
function agentIcon(agent) {
  const icon = el('span', 'sess-agent');
  icon.innerHTML = window.AgentPawIcons.agent(agent);
  icon.title = AGENT_NAME[agent] || 'Claude';
  return icon;
}
function elapsedText(ms) {
  const s = Math.max(0, Math.floor(ms / 1000)), m = Math.floor(s / 60);
  return m >= 60 ? `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}` : `${m}:${String(s % 60).padStart(2, '0')}`;
}
function effectiveState(s) {
  return s.state === 'idle' && s.badge === 'done' ? 'done' : s.state === 'idle' && s.badge === 'interrupted' ? 'error' : s.state;
}
function focusSession(sessionId) {
  if (sessionId && window.pet.focusSession) window.pet.focusSession(sessionId);
}

function renderSessions(sessions) {
  const priority = { waiting: 0, needsinput: 1, error: 2, sweeping: 3, juggling: 4, working: 5, thinking: 6, loafing: 7, done: 8 };
  const rows = (sessions || [])
    .filter(s => s && !s.headless && !s.archived && (BUSY.has(s.state) || ATTENTION.has(s.state) || s.state === 'error' || s.state === 'loafing' || s.badge === 'done' || s.badge === 'interrupted'))
    .sort((a, b) => (priority[effectiveState(a)] ?? 9) - (priority[effectiveState(b)] ?? 9) || Number(b.updatedAt || 0) - Number(a.updatedAt || 0));
  const list = $('sess-list');
  list.replaceChildren();
  $('sess-count').textContent = rows.length ? window.AgentPawI18n.text('{0} 个', [rows.length]) : '';
  if (!rows.length) {
    list.append(el('div', 'empty', t('panel.noActiveSession')));
    return;
  }
  for (const s of rows.slice(0, 8)) {
    const state = effectiveState(s);
    const meta = STATE_META[state] || STATE_META.idle;
    const background = BUSY.has(state) ? backgroundStatus(s) : '';
    const detail = state === 'waiting' ? t(s.reason ? 'wait.' + s.reason : 'wait.default')
      : state === 'needsinput' ? (s.choice && s.choice.question) || t('state.needsinput')
      : background || (BUSY.has(state) && s.op) || t(meta.key);
    const row = el('div', 'sess' + (s.focusable ? ' focusable' : ''));
    const main = el('div', 'sess-main');
    const project = el('div', 'sess-proj', s.alias || s.project || '');
    project.title = s.alias || s.project || '';
    if (s.model) project.append(el('span', 'sess-model', String(s.model).replace(/^claude-/, '')));
    const op = el('div', 'sess-op', detail);
    op.title = detail;
    main.append(project, op);
    const side = el('div', 'sess-side');
    if (ATTENTION.has(state) && s.focusable) {
      const go = el('button', 'go', window.AgentPawI18n.text('去处理'));
      go.type = 'button';
      go.addEventListener('click', event => { event.stopPropagation(); focusSession(s.sessionId); });
      side.append(go);
    } else if (BUSY.has(state) && s.turnStartedAt > 0) {
      const clock = el('span', 'sess-time num live-clock', elapsedText(Date.now() - s.turnStartedAt));
      clock.dataset.start = s.turnStartedAt;
      clock.title = window.AgentPawI18n.text('本轮已运行');
      side.append(clock);
    } else if (state === 'done' && s.updatedAt > 0) {
      side.append(el('span', 'sess-time', window.AgentPawI18n.text('{0}前', [durationText(Date.now() - s.updatedAt)])));
    }
    if (Number.isFinite(Number(s.contextPercent)) && s.contextPercent != null) {
      const pct = Math.max(0, Math.min(100, Number(s.contextPercent)));
      const ctx = el('span', 'ctx' + (pct >= 80 ? ' high' : ''));
      const track = el('i'), fill = el('b');
      fill.style.width = pct + '%';
      track.append(fill);
      ctx.append(track, document.createTextNode(window.AgentPawI18n.text('上下文 {0}%', [pct.toFixed(0)])));
      side.append(ctx);
    }
    row.append(el('span', 'badge ' + meta.cls, t(meta.key)), agentIcon(s.agent), main, side);
    if (s.focusable) {
      row.tabIndex = 0;
      row.title = t('peek.focus');
      row.addEventListener('click', () => focusSession(s.sessionId));
      row.addEventListener('keydown', event => { if (event.key === 'Enter') focusSession(s.sessionId); });
    }
    list.append(row);
  }
}

function renderRecent(recent) {
  const rows = Array.isArray(recent) ? recent : [];
  $('recent-block').hidden = !rows.length;
  if (!rows.length) return;
  const count = kind => rows.filter(row => row.kind === kind).length;
  const parts = [window.AgentPawI18n.text('近 7 天：完成 {0}', [count('done')])];
  if (count('failed')) parts.push(window.AgentPawI18n.text('失败 {0}', [count('failed')]));
  if (count('attention')) parts.push(window.AgentPawI18n.text('需处理 {0}', [count('attention')]));
  $('recent-sum').textContent = parts.join(' · ');
  const KIND = { done: ['已完成', 'st-done'], failed: ['失败', 'st-error'], attention: ['需处理', 'st-waiting'] };
  const list = $('recent-list');
  list.replaceChildren();
  for (const row of rows.slice(0, 8)) {
    const [label, cls] = KIND[row.kind] || KIND.done;
    const item = el('li');
    item.append(el('span', 'badge ' + cls, window.AgentPawI18n.text(label)), agentIcon(row.agent),
      el('span', 'recent-name', row.alias || row.project || ''),
      el('span', 'recent-when', window.AgentPawI18n.text('{0}前', [durationText(Date.now() - row.at)])));
    list.append(item);
  }
}

function renderSubtitle(s) {
  const sub = $('active-sub');
  const visible = (s.sessions || []).filter(row => row && !row.headless && !row.archived);
  const attention = visible.filter(row => ATTENTION.has(row.state)).length;
  const busy = visible.filter(row => BUSY.has(row.state)).length;
  sub.replaceChildren();
  if (attention) sub.append(el('b', '', window.AgentPawI18n.text('{0} 个任务等你处理', [attention])));
  if (busy) sub.append(document.createTextNode((attention ? ' · ' : '') + window.AgentPawI18n.text('{0} 个进行中', [busy])));
  if (!attention && !busy) {
    sub.textContent = s.active?.project ? `${s.active.project}${s.active.model ? ' · ' + s.active.model : ''}` : t('panel.waitingSession');
  }
}

function renderLive(s) {
  renderSubtitle(s);
  renderQuota(s.codexQuota);
  renderSessions(s.sessions);
  renderRecent(s.recent);
}
setInterval(() => {
  for (const node of document.querySelectorAll('.live-clock')) node.textContent = elapsedText(Date.now() - Number(node.dataset.start));
}, 1000);
setInterval(() => { if (lastStats) renderQuota(lastStats.codexQuota); }, 30000);

/* ---------- 价目表状态（口径浮层内） ---------- */
let lastPrice = null;
window.pet.onPanelStats(render);
function renderPrice(m) {
  lastPrice = m;
  const target = $('price-src');
  if (!target || !m) return;
  const sources = Array.isArray(m.sources) ? m.sources : [];
  const names = sources.map((source) => source.name).filter(Boolean).join('、');
  const scope = names ? window.AgentPawI18n.text("{0} · {1} 个模型", [names, m.count || 0]) : window.AgentPawI18n.text("{0} 个模型", [m.count || 0]);
  const sync = m.sync && typeof m.sync === 'object' ? m.sync : {};
  let syncText = '';
  if (sync.phase === 'scheduled') syncText = window.AgentPawI18n.text(" · 等待同步");
  if (sync.phase === 'syncing') syncText = window.AgentPawI18n.text(" · 正在同步…");
  if (sync.phase === 'error') {
    const retryMin = Math.max(1, Math.ceil(Math.max(0, Number(sync.nextAttemptTs) - Date.now()) / 60000));
    syncText = window.AgentPawI18n.text(" · 同步失败，约 {0} 分钟后重试", [retryMin]);
  }
  if (m.live) {
    const when = m.ts ? new Date(m.ts).toLocaleString(window.AgentPawI18n.getLanguage(), { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : window.AgentPawI18n.text("缓存");
    target.textContent = window.AgentPawI18n.text("价目表: 在线（{0}，{1} 更新）{2}{3}", [scope, when, m.stale ? window.AgentPawI18n.text(" · 缓存已过期") : '', syncText]);
  } else if (m.mixed) {
    target.textContent = window.AgentPawI18n.text("价目表: 部分在线、部分内置（{0}）{1}{2}", [scope, m.stale ? window.AgentPawI18n.text(" · 缓存已过期") : '', syncText]);
  } else {
    target.textContent = window.AgentPawI18n.text("价目表: 内置价格（{0}）{1}", [scope, syncText]);
  }
  target.title = sync.phase === 'error' && sync.error ? String(sync.error) : '';
}
window.pet.onPrice(renderPrice);

function applyStaticI18n() {
  window.AgentPawI18n.localizeDocument(document);
  document.title = window.AgentPawI18n.text("AgentPaw · 详情");
}

$('close').addEventListener('click', () => window.pet.closePanel());

// 详情面板是独立窗口，ESC 先收起口径说明，再收起面板本身。
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  e.preventDefault();
  if (closeInfo()) return;
  window.pet.closePanel();
});

// Initialize after both renderers load.
(async () => {
  applyStaticI18n();
  initUsageControls();
  const s = await window.pet.getStats();
  if (s) render(s);
  setTimeout(fitOnce, 300);
})();

window.addEventListener('agentpaw:language', () => { applyStaticI18n(); if (lastStats) render(lastStats); if (lastPrice) renderPrice(lastPrice); });
