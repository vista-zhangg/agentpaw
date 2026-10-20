'use strict';

// Quick view: one surface for what needs you, what is running, recent sessions
// and the last 7 days. Pending cards are reconciled by pet.js (renderActionPop);
// this file owns the rest. Preferences and history live in the main process.
(function () {
  const get = id => document.getElementById(id);
  const text = (source, args) => window.AgentPawI18n.text(source, args);
  const icon = name => window.AgentPawIcons?.icon(name) || '';
  let stats = null;
  let editingId = '';
  let busy = false;
  let recentOpen = false;
  let recentSignature = '';
  let recentCards = new Map();
  let sessionSignature = '';
  let unseen = new Set();
  const pendingReadIds = new Set();
  const readError = () => text("已读状态保存失败，重新展开记录可重试");
  const status = get('ac-status');

  function element(tag, className, content) {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (content != null) el.textContent = content;
    return el;
  }
  function button(label, click, className = 'btn sm') {
    const el = element('button', className, text(label));
    el.type = 'button';
    el.addEventListener('click', event => { event.stopPropagation(); click(); });
    return el;
  }
  function iconButton(name, label, click, pressed) {
    const el = element('button', 'icon-btn sm');
    el.type = 'button';
    el.innerHTML = icon(name);
    el.title = label;
    el.setAttribute('aria-label', label);
    if (pressed != null) el.setAttribute('aria-pressed', String(pressed));
    el.addEventListener('click', event => { event.stopPropagation(); click(); });
    return el;
  }
  function agentMark(agent) {
    const el = element('span', 'agent');
    el.innerHTML = window.AgentPawIcons?.agent(agent) || '';
    el.title = peekAgentLabel(agent);
    return el;
  }
  function title(row) { return row.alias || row.project || text("未命名会话"); }
  function ago(at) {
    const seconds = Math.max(0, (Date.now() - at) / 1000);
    if (seconds < 60) return text("刚刚");
    if (seconds < 3600) return text("{0} 分钟前", [Math.floor(seconds / 60)]);
    if (seconds < 86400) return text("{0} 小时前", [Math.floor(seconds / 3600)]);
    return text("{0} 天前", [Math.floor(seconds / 86400)]);
  }
  function clock(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600), m = Math.floor(total / 60) % 60, s = total % 60;
    return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
  }
  async function run(action) {
    if (busy) return false;
    busy = true;
    status.textContent = '';
    try {
      const result = await action();
      if (result !== true && (!result || !result.ok)) throw new Error(result?.message || text("操作未完成，请重试"));
      return true;
    } catch (error) { status.textContent = error.message || text("操作未完成，请重试"); return false; }
    finally { busy = false; }
  }
  const refit = () => { if (actionPopOpen) fitPopup(actionPop); };

  // ---------- 摘要与今日数据 ----------
  const ATTENTION = new Set(['waiting', 'needsinput']);
  const effective = row => peekSessionState(row);
  function visibleSessions() {
    return (stats.sessions || []).filter(row => row && !row.headless && (row.pinned || row.state !== 'sleeping'));
  }
  function isActive(row) {
    return PEEK_BUSY_STATES.has(row.state) || row.pinned;
  }
  function renderSummary() {
    const box = get('qv-summary');
    box.innerHTML = '';
    const pending = Math.max(actionableItems().length, (stats.waitingCount || 0) + (stats.needsinputCount || 0));
    const sessions = visibleSessions();
    const running = sessions.filter(row => PEEK_BUSY_STATES.has(row.state) && !ATTENTION.has(row.state) && row.state !== 'error').length;
    const errors = sessions.filter(row => row.state === 'error').length;
    const add = (label, cls) => box.appendChild(element('span', 'badge ' + cls, label));
    if (pending) add(text("需要你 {0}", [pending]), 'st-need');
    if (errors) add(text("异常 {0}", [errors]), 'st-error');
    if (running) add(text("运行中 {0}", [running]), 'st-working');
    if (!box.children.length) box.appendChild(element('span', 'pop-title', text("没有进行中的任务")));
  }
  function renderToday() {
    const box = get('qv-today');
    box.innerHTML = '';
    const usage = petInsights.usage(stats);
    const tile = (label, value, detail, warn) => {
      const el = element('div', 'tile');
      el.append(element('div', 'k', label), element('div', 'v num' + (warn ? ' warn' : ''), value));
      if (detail) el.appendChild(element('div', 'd' + (warn ? ' warn' : ''), detail));
      box.appendChild(el);
    };
    tile(text("今日费用"), '$' + usage.cost.toFixed(2), text("按 API 价格估算"));
    tile(text("今日 Token"), compactTokens(usage.tokens),
      usage.cacheRate == null ? text("{0} 轮对话", [usage.rounds]) : text("缓存命中 {0}%", [usage.cacheRate.toFixed(0)]));
    const quota = stats.codexQuota || {};
    const entry = quota.status === 'ready' && quotaWindowEntries(quota)[0];
    const claude = stats.claudeQuota;
    // Four tiles leave no room for "quota" in the labels.
    if (entry) {
      const [key, labelKey] = entry;
      const remaining = quotaRemainingPercent(quota.windows[key]);
      const forecast = quota.forecast && quota.forecast[key];
      const runsOut = forecast && forecast.status === 'ready' && forecast.exhaustAt;
      const span = labelKey === 'quota.fiveHour' ? '5h' : '7d';
      tile(claude ? 'Codex ' + span : text("Codex {0} 额度", [span]),
        remaining == null ? '--' : Math.round(remaining) + '%',
        runsOut ? text("约 {0} 用完", [quotaClockText(forecast.exhaustAt)]) : quotaResetShort(quota.windows[key]),
        !!runsOut || (remaining != null && remaining <= 20));
    }
    // Claude Code plan usage, only while the user has turned it on.
    if (claude) {
      const claudeEntry = claude.status === 'ready' && quotaWindowEntries(claude)[0];
      if (claudeEntry) {
        const [key, labelKey] = claudeEntry;
        const remaining = quotaRemainingPercent(claude.windows[key]);
        tile('Claude ' + (labelKey === 'quota.fiveHour' ? '5h' : '7d'),
          remaining == null ? '--' : Math.round(remaining) + '%', quotaResetShort(claude.windows[key]),
          remaining != null && remaining <= 20);
      } else {
        tile('Claude', '--', text("终端 claude 回复后更新"));
      }
    }
    box.dataset.count = String(box.children.length);
  }

  // ---------- 会话行（与详情面板同一套样式） ----------
  function stateWord(row) {
    const state = effective(row);
    if (state === 'done') return [text("完成"), 'done'];
    if (state === 'error') return [row.state === 'idle' ? t('peek.interrupted') : t('state.error'), 'error'];
    if (ATTENTION.has(state)) return [t(SESS_META_KEY[state]), 'need'];
    if (PEEK_BUSY_STATES.has(state)) return [t(SESS_META_KEY[state] || 'state.working'), state === 'thinking' ? 'thinking' : 'working'];
    return [row.archived ? text("已结束") : t('state.idle'), 'idle'];
  }
  function sessionRow(row) {
    const card = element('div', 'sess compact');
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    const focusable = row.focusable !== false && row.sessionId;
    card.title = focusable ? text("打开会话") : text("在详情面板查看");
    const main = element('div', 'main');
    const proj = element('div', 'proj');
    if (row.pinned) {
      const star = element('span', 'star');
      star.innerHTML = icon('starFill');
      proj.appendChild(star);
    }
    proj.appendChild(element('span', 'name', title(row)));
    if (unseen.has(row.sessionId)) {
      const dot = element('span', 'new-dot');
      dot.title = text("新完成，还没看过");
      proj.appendChild(dot);
    }
    if (row.model) proj.appendChild(element('span', 'model', row.model));
    const [word, tone] = stateWord(row);
    const op = element('div', 'op');
    op.appendChild(element('span', 'sw-t ' + tone, word));
    const live = PEEK_BUSY_STATES.has(row.state) || ATTENTION.has(row.state);
    const detail = row.archived ? '' : live ? peekSessionDetail(row) : (row.op || '');
    if (detail && detail !== word) op.append(' · ' + detail);
    op.title = op.textContent;
    main.append(proj, op);
    const side = element('div', 'side');
    const started = Number(row.turnStartedAt) || 0;
    side.appendChild(element('span', 'time num',
      started && PEEK_BUSY_STATES.has(effective(row)) ? clock(Date.now() - started) : ago(Date.now() - (row.idleMs || 0))));
    if (Number.isFinite(row.contextPercent)) {
      const pct = Math.max(0, Math.min(100, Math.round(row.contextPercent)));
      const ctx = element('span', 'ctx' + (pct >= 80 ? ' high' : ''));
      const bar = element('i'); const fill = element('b'); fill.style.width = pct + '%';
      bar.appendChild(fill);
      ctx.append(bar, text("上下文 {0}%", [pct]));
      side.appendChild(ctx);
    }
    const tools = element('div', 'row-tools');
    tools.append(
      iconButton(row.pinned ? 'starFill' : 'star', text(row.pinned ? "取消关注" : "关注"),
        () => run(() => window.pet.updateSessionPreferences(row.sessionId, { pinned: !row.pinned })), !!row.pinned),
      iconButton('edit', text("改名与静音"), () => openEditor(row, card)));
    card.append(agentMark(row.agent), main, side, tools);
    const open = async () => {
      if (editingId) return;
      if (!focusable) { window.pet.openPanel(AGENT); closeActionPop(); return; }
      if (await run(async () => {
        if (!await window.pet.focusSession(row.sessionId)) throw new Error(text("未能打开会话，请到对应 Agent 中查看"));
        return true;
      })) closeActionPop();
    };
    card.addEventListener('click', event => { event.stopPropagation(); open(); });
    card.addEventListener('keydown', event => {
      if (event.target !== card || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault(); open();
    });
    return card;
  }
  function openEditor(row, card) {
    if (editingId || busy) return;
    editingId = row.sessionId;
    card.classList.add('editing');
    const form = element('form', 'sess-editor');
    const nameLabel = element('label', '');
    nameLabel.appendChild(element('span', '', text("会话别名")));
    const input = element('input', 'inp');
    input.type = 'text'; input.maxLength = 40; input.value = row.alias || '';
    input.placeholder = stats.privacyMode ? text("隐私模式下隐藏别名") : text("例如：修登录（可留空）");
    input.disabled = stats.privacyMode === true;
    nameLabel.appendChild(input);
    const muteLabel = element('label', 'mute-label');
    const mute = element('input', ''); mute.type = 'checkbox'; mute.checked = row.projectMuted === true;
    muteLabel.append(mute, element('span', '', text("不弹出这个项目的任务提醒")));
    const actions = element('div', 'editor-actions');
    const save = button("保存", async () => {
      if (await run(() => window.pet.updateSessionPreferences(row.sessionId, { alias: input.value, muted: mute.checked }))) {
        editingId = ''; sessionSignature = ''; renderSessions(true); refit();
      }
    }, 'btn sm primary');
    const cancel = button("取消", () => { editingId = ''; renderSessions(true); refit(); });
    actions.append(cancel, save);
    form.append(nameLabel, muteLabel, actions);
    form.addEventListener('click', event => event.stopPropagation());
    form.addEventListener('submit', event => { event.preventDefault(); save.click(); });
    form.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); cancel.click(); }
    });
    card.after(form);
    input.focus();
    refit();
  }
  function renderSessions(force = false) {
    if (editingId && !force) return;
    const rows = visibleSessions();
    const byUpdate = (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0);
    const rank = row => ATTENTION.has(row.state) || row.state === 'error' ? 0 : PEEK_BUSY_STATES.has(row.state) ? 1 : 2;
    const active = rows.filter(isActive).sort((a, b) => rank(a) - rank(b) || (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || byUpdate(a, b));
    unseen = unseenDoneSessions(stats);
    const fresh = row => unseen.has(row.sessionId) ? 0 : 1;
    const others = rows.filter(row => !isActive(row)).sort((a, b) => fresh(a) - fresh(b) || byUpdate(a, b))
      .filter((row, index) => index < 4 || unseen.has(row.sessionId));
    const signature = JSON.stringify([...active, ...others].map(row => [row.sessionId, row.alias, row.project, row.model, row.state, row.badge,
      row.pinned, row.projectMuted, row.archived, row.focusable, row.contextPercent, row.op, row.turnStartedAt, unseen.has(row.sessionId)])) + stats.privacyMode + window.AgentPawI18n.getLanguage();
    if (!force && sessionSignature === signature) {
      // Times move every second; refresh them without rebuilding focused controls.
      for (const [list, items] of [[get('ac-session-list'), active], [get('ac-other-list'), others]]) {
        [...list.querySelectorAll('.sess')].forEach((card, index) => {
          const row = items[index]; const time = card.querySelector('.time');
          if (!row || !time) return;
          const started = Number(row.turnStartedAt) || 0;
          time.textContent = started && PEEK_BUSY_STATES.has(effective(row)) ? clock(Date.now() - started) : ago(Date.now() - (row.idleMs || 0));
        });
      }
      return;
    }
    sessionSignature = signature;
    const list = get('ac-session-list');
    list.innerHTML = '';
    active.forEach(row => list.appendChild(sessionRow(row)));
    get('qv-sessions-count').textContent = active.length ? String(active.length) : '';
    get('ac-sessions-sec').hidden = !active.length && !!others.length;
    if (!active.length && !others.length) list.appendChild(element('p', 'qv-empty', text("接入 Agent 后，会话会出现在这里")));
    else if (!active.length) list.appendChild(element('p', 'qv-empty', text("没有进行中的任务")));
    const otherList = get('ac-other-list');
    otherList.innerHTML = '';
    others.forEach(row => otherList.appendChild(sessionRow(row)));
    get('ac-others-sec').hidden = !others.length;
  }

  // ---------- 近 7 天 ----------
  async function markViewedRecent() {
    // Acknowledge only the entry snapshot, never records arriving during polling.
    const ids = (stats?.recent || []).filter(row => !row.read).map(row => row.id);
    await Promise.resolve();
    if (!actionPopOpen || !recentOpen) return;
    const unread = ids.filter(id => !pendingReadIds.has(id));
    if (!unread.length) return;
    unread.forEach(id => pendingReadIds.add(id));
    try {
      const result = await window.pet.markRecentRead(unread);
      if (!result?.ok) throw new Error('mark read failed');
      if (status.textContent === readError()) status.textContent = '';
    } catch {
      if (actionPopOpen && recentOpen) status.textContent = readError();
    } finally {
      unread.forEach(id => pendingReadIds.delete(id));
    }
  }
  const KIND = { done: ["完成", 'st-done'], failed: ["失败", 'st-error'], attention: ["需要你", 'st-need'] };
  function renderRecent() {
    const rows = stats.recent || [];
    const count = kind => rows.filter(row => row.kind === kind).length;
    const unread = rows.filter(row => !row.read).length;
    const toggle = get('ac-recent-toggle');
    toggle.innerHTML = '';
    toggle.setAttribute('aria-expanded', String(recentOpen));
    toggle.append(element('span', '', text("近 7 天")));
    const parts = element('span', 'parts');
    for (const kind of ['done', 'failed', 'attention']) {
      const item = element('span', '');
      item.append(element('b', 'num', String(count(kind))), ' ' + text(KIND[kind][0]));
      parts.appendChild(item);
    }
    toggle.appendChild(parts);
    if (unread && !recentOpen) toggle.appendChild(element('span', 'new', text("{0} 条新", [unread])));
    const chev = element('span', 'chev'); chev.innerHTML = icon('chevron') || '›';
    toggle.appendChild(chev);
    get('ac-recent-body').hidden = !recentOpen;
    get('ac-clear-recent').disabled = !rows.length;
    if (!recentOpen) return;
    const list = get('ac-recent-list');
    const signature = JSON.stringify(rows) + window.AgentPawI18n.getLanguage();
    if (signature === recentSignature) {
      for (const [id, { card }] of recentCards) {
        const at = rows.find(row => row.id === id)?.at;
        if (at) card.querySelector('time').textContent = ago(at);
      }
      return;
    }
    recentSignature = signature;
    if (!rows.length) {
      list.innerHTML = '';
      recentCards.clear();
      list.appendChild(element('p', 'qv-empty', text("完成、失败与需要处理的事件会留在这里")));
      return;
    }
    if (!recentCards.size) list.innerHTML = '';
    // Reconcile by record so a focused row survives incoming history.
    const next = new Map();
    for (const row of rows) {
      const rowSignature = JSON.stringify(row) + window.AgentPawI18n.getLanguage();
      const previous = recentCards.get(row.id);
      next.set(row.id, previous?.signature === rowSignature ? previous : { signature: rowSignature, card: historyRow(row) });
    }
    for (const [id, previous] of recentCards) if (next.get(id)?.card !== previous.card) previous.card.remove();
    [...next.values()].forEach(({ card }, index) => {
      if (list.children[index] !== card) list.insertBefore(card, list.children[index] || null);
    });
    recentCards = next;
  }
  function historyRow(row) {
    const ev = element(row.focusable ? 'button' : 'div', 'ev' + (row.read ? '' : ' unread'));
    if (row.focusable) {
      ev.type = 'button';
      ev.title = text("打开会话");
      ev.addEventListener('click', async event => {
        event.stopPropagation();
        if (await run(async () => {
          if (!await window.pet.focusRecent(row.id)) throw new Error(text("未能打开会话，请到对应 Agent 中查看"));
          return true;
        })) closeActionPop();
      });
    }
    const [kind, cls] = KIND[row.kind] || KIND.done;
    const time = element('time', 'when num', ago(row.at));
    time.title = new Date(row.at).toLocaleString(window.AgentPawI18n.getLanguage());
    ev.append(element('span', 'badge ' + cls, text(kind)), agentMark(row.agent), element('span', 'name', title(row)), time);
    return ev;
  }

  function render(value) {
    if (!value) return;
    if (value.privacyMode !== stats?.privacyMode) { editingId = ''; sessionSignature = ''; }
    stats = value;
    const pending = Math.max(actionableItems().length, (stats.waitingCount || 0) + (stats.needsinputCount || 0));
    get('qv-need-count').textContent = pending ? String(pending) : '';
    get('ac-act-sec').hidden = !pending;
    const hiddenDetails = pending && !actionableItems().length;
    get('ac-empty').hidden = !hiddenDetails;
    get('ac-empty').textContent = hiddenDetails ? text("明细已隐藏，点下面的会话去处理") : '';
    if (stats.taskCenterStorageError) status.textContent = text("最近记录暂未保存到磁盘，请检查本地目录是否可写");
    renderSummary(); renderToday(); renderSessions(); renderRecent();
  }

  get('ac-recent-toggle').addEventListener('click', event => {
    event.stopPropagation();
    recentOpen = !recentOpen;
    recentSignature = '';
    renderRecent(); refit();
    if (recentOpen) markViewedRecent();
  });
  get('ac-clear-recent').addEventListener('click', event => { event.stopPropagation(); run(() => window.pet.clearRecent()); });
  if (window.pet.onWorkflowCommand) window.pet.onWorkflowCommand(command => {
    if (command === 'peek') {
      // A half-typed alias must survive the toggle shortcut.
      if (actionPopOpen) { if (!editingId) closeActionPop(); return; }
      openActionPop();
    } else if (command === 'actions') {
      if (!actionPopOpen) openActionPop();
      actionPop.querySelector('.pop-body').scrollTop = 0;
    }
  });
  window.addEventListener('agentpaw:language', () => { recentSignature = ''; if (!editingId) sessionSignature = ''; render(stats); });
  window.AgentPawTaskCenter = {
    render,
    opened() { editingId = ''; recentOpen = false; status.textContent = ''; sessionSignature = ''; render(lastStats); },
    closed() { editingId = ''; sessionSignature = ''; recentOpen = false; },
  };
})();
