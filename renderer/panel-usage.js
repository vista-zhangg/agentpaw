'use strict';

const Usage = window.AgentPawUsage;
const usageState = { source: 'all', range: 'today', day: null, view: 'daily', metric: 'tokens', group: 'source' };
let usageData = null, usageSelection = null, activityPoints = [], activityKey = null;
let expandedModels = false, previousRange = 'today';
const shortDate = key => key.slice(5).replace('-', '/');
const usd = n => n > 0 && n < .001 ? '< $0.001' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
function amount(row) { return !row.known ? '—' : row.cost > 0 ? usd(row.cost) : row.tokens > 0 ? window.AgentPawI18n.text("未计价 / 未记录") : '$0.000'; }
function exact(id, value, suffix = ' Token') {
  $(id).textContent = value == null ? '—' : fmt(value);
  $(id).title = value == null ? window.AgentPawI18n.text("缺少可用记录") : Number(value).toLocaleString(window.AgentPawI18n.getLanguage()) + suffix;
}
function sourceLabel() { return usageState.source === 'all' ? window.AgentPawI18n.text("全部工具") : usageData.sources.find(row => row.id === usageState.source)?.label || usageState.source; }
function periodName() { return usageState.range === 'day' ? shortDate(usageState.day) : { today: window.AgentPawI18n.text("今日"), '7d': window.AgentPawI18n.text("近 7 天"), '30d': window.AgentPawI18n.text("近 30 天") }[usageState.range]; }
function saveUsagePreferences() {
  try { window.localStorage.setItem('agentpaw.panel.usage.v1', JSON.stringify({ ...usageState, range: usageState.range === 'day' ? previousRange : usageState.range, day: null })); } catch {}
}
function renderUsage(s) {
  if (!s.usage || s.usage.version !== 1) {
    $('usage-warning').hidden = false;
    $('usage-warning').textContent = window.AgentPawI18n.text("用量数据尚未就绪，请等待下一次更新。");
    return;
  }
  usageData = s.usage;
  if (usageState.source !== 'all' && !usageData.sources.some(row => row.id === usageState.source)) usageState.source = 'all';
  const options = window.AgentPawI18n.text("<option value=\"all\">全部工具</option>") + usageData.sources.map(row => `<option value="${escapeHtml(row.id)}">${escapeHtml(row.label)}</option>`).join('');
  if ($('usage-source').innerHTML !== options) $('usage-source').innerHTML = options;
  $('usage-source').value = usageState.source;
  usageSelection = Usage.selection(usageData, usageState);
  const { current: row, previous, comparable, start, end, keys, recordedDays, today } = usageSelection;
  const label = `${periodName()} · ${sourceLabel()}`;
  document.querySelectorAll('[data-range],[data-group],[data-metric],[data-view]').forEach(button => {
    const type = ['range', 'group', 'metric', 'view'].find(key => button.dataset[key]);
    button.setAttribute('aria-pressed', String(button.dataset[type] === usageState[type]));
  });
  $('clear-day').hidden = usageState.range !== 'day';
  $('usage-period').textContent = window.AgentPawI18n.text("{0} · {1} · {2} · {3}/{4} 天有记录", [start === end ? start : `${start} – ${end}`, sourceLabel(), end === today ? window.AgentPawI18n.text("今日截至 ") + new Date(usageData.asOf).toLocaleTimeString(window.AgentPawI18n.getLanguage(), { hour: '2-digit', minute: '2-digit' }) : window.AgentPawI18n.text("完整自然日范围"), recordedDays, keys.length]);
  const scoped = Usage.sources(usageData, usageState.source);
  const unavailable = scoped.filter(source => source.unavailable).map(source => source.label);
  $('usage-warning').textContent = unavailable.length ? window.AgentPawI18n.text("{0} 的数据源暂不可用；当前仅展示已采集记录。", [unavailable.join('、')]) : '';
  $('usage-warning').hidden = !unavailable.length;
  exact('period-tokens', row.known ? row.tokens : null);
  $('today-cost').textContent = amount(row);
  $('today-cost').title = window.AgentPawI18n.text("台账已记录参考金额（USD），计价覆盖未知，不代表实际账单");
  $('token-change').textContent = !row.known ? window.AgentPawI18n.text("无记录，不代表零用量") : comparable ? window.AgentPawI18n.text("较前 {0} 天 {1}", [keys.length, Usage.change(row.tokens, previous.tokens)]) : end === today ? window.AgentPawI18n.text("今日尚未结束，暂不作环比") : window.AgentPawI18n.text("同期记录不完整，暂不作环比");
  $('cost-change').textContent = !row.known ? window.AgentPawI18n.text("没有可用金额记录") : comparable && row.cost > 0 && previous.cost > 0 ? window.AgentPawI18n.text("已记录金额较前期 {0}", [Usage.change(row.cost, previous.cost)]) : row.tokens && !row.cost ? window.AgentPawI18n.text("零金额不代表免费") : window.AgentPawI18n.text("仅已记录金额 · 覆盖率未知");
  $('pricing-coverage').textContent = !row.known ? window.AgentPawI18n.text("暂无记录 · 计价覆盖未知") : !row.tokens ? window.AgentPawI18n.text("无已记录 Token 用量") : window.AgentPawI18n.text("计价覆盖未知 · 金额可能不完整");
  $('token-detail-title').textContent = label;
  $('cache-hit-rate').textContent = row.cacheRate == null ? '—' : row.cacheRate.toFixed(1) + '%';
  const rateDiff = row.cacheRate != null && previous.cacheRate != null ? row.cacheRate - previous.cacheRate : null;
  $('cache-change').textContent = !row.known ? window.AgentPawI18n.text("无记录") : !row.detailComplete ? window.AgentPawI18n.text("输入明细不完整") : !row.inputTotal ? window.AgentPawI18n.text("无输入，比例不适用") : comparable && rateDiff != null ? Math.abs(rateDiff) < .05 ? window.AgentPawI18n.text("较前期持平") : window.AgentPawI18n.text("较前期 {0} {1} 个百分点", [rateDiff > 0 ? '↑' : '↓', Math.abs(rateDiff).toFixed(1)]) : window.AgentPawI18n.text("缓存读取 ÷ 全部输入");
  const visible = key => row.known && (row.detailComplete || row[key] > 0) ? row[key] : null;
  exact('cache-tokens', visible('cacheRead'));
  exact('cache-write', visible('cacheWrite'));
  const tokenRow = (name, value, id = '', note = '') => `<div class="row"><span>${name}${note ? `<small>${note}</small>` : ''}</span><b${id ? ` id="${id}"` : ''} title="${value == null ? window.AgentPawI18n.text("缺少可用明细") : Number(value).toLocaleString(window.AgentPawI18n.getLanguage())}">${value == null ? '—' : fmt(value)}</b></div>`;
  $('token-rows').innerHTML = tokenRow(window.AgentPawI18n.text("输入 Token"), visible('inputTotal'), 't-in', window.AgentPawI18n.text("含缓存读取与写入"))
    + tokenRow(window.AgentPawI18n.text("输出 Token"), visible('output'), 't-out')
    + tokenRow(window.AgentPawI18n.text("普通输入"), row.normalInput)
    + tokenRow(window.AgentPawI18n.text("其中：推理 Token"), row.reasoningOutput || null, '', row.reasoningOutput ? window.AgentPawI18n.text("已记录部分，已计入输出") : window.AgentPawI18n.text("未单独记录，不等同于零"))
    + tokenRow(window.AgentPawI18n.text("计量记录"), visible('messages'), 't-msg')
    + (!row.detailComplete && row.known ? window.AgentPawI18n.text("<p class=\"scope-note token-note\">部分历史记录缺少输入/输出明细，已记录分项可能与总量不一致。</p>") : '');
  $('cache-write-breakdown').hidden = !row.cacheWrite;
  $('cache-write-rows').innerHTML = [[window.AgentPawI18n.text("5 分钟缓存"), 'cacheWrite5m'], [window.AgentPawI18n.text("1 小时缓存"), 'cacheWrite1h'], [window.AgentPawI18n.text("未区分时长"), 'cacheWriteUnspecified']].filter(([, key]) => row[key] > 0).map(([name, key]) => tokenRow(name, row[key])).join('');
  renderDistribution();
  renderActivity();
  const lifetime = Usage.sum(scoped.flatMap(source => source.lifetime ? [source.lifetime] : []));
  exact('lt-tokens', lifetime.known ? lifetime.tokens : null);
  $('lt-cost').textContent = amount(lifetime);
  exact('lt-msgs', lifetime.known ? lifetime.messages : null, window.AgentPawI18n.text(" 条"));
  if (lifetime.known) $('lt-msgs').textContent = lifetime.messages.toLocaleString(window.AgentPawI18n.getLanguage()) + window.AgentPawI18n.text(" 条");
  $('lifetime-note').textContent = window.AgentPawI18n.text("{0} · 本机已记录的历史累计，可能超出活动图保留窗口。金额计价覆盖未知。", [sourceLabel()]);
  $('updated-at').textContent = window.AgentPawI18n.text("本机统计 · 系统本地时区 · 更新于 {0}", [timeStr(usageData.asOf)]);
}
function renderDistribution() {
  if (!usageSelection) return;
  const rows = [...(usageState.group === 'source' ? usageSelection.bySource : usageSelection.byModel)]
    .sort((a, b) => b[usageState.metric] - a[usageState.metric] || b.tokens - a.tokens || a.name.localeCompare(b.name));
  const total = usageSelection.current[usageState.metric];
  $('distribution-name').textContent = (usageState.group === 'source' ? window.AgentPawI18n.text("工具") : window.AgentPawI18n.text("模型")) + (usageState.metric === 'cost' ? window.AgentPawI18n.text(" / 已记录金额占比") : window.AgentPawI18n.text(" / Token 占比"));
  $('distribution-scope').textContent = `${periodName()} · ${sourceLabel()}`;
  $('by-model').innerHTML = rows.length ? rows.slice(0, expandedModels ? rows.length : 8).map(row => `<tr><td><span>${escapeHtml(row.name)}</span><small>${total > 0 && (usageState.metric !== 'cost' || row.cost > 0) ? (row[usageState.metric] / total * 100).toFixed(1) + '%' : '—'}</small></td><td title="${row.tokens.toLocaleString(window.AgentPawI18n.getLanguage())}">${fmt(row.tokens)}</td><td>${escapeHtml(amount(row))}</td></tr>`).join('') : window.AgentPawI18n.text("<tr><td colspan=\"3\" class=\"empty\">所选范围没有用量记录</td></tr>");
  $('show-all-models').hidden = rows.length <= 8;
  $('show-all-models').textContent = expandedModels ? window.AgentPawI18n.text("收起") : window.AgentPawI18n.text("展开全部 {0} 项", [rows.length]);
}
function renderActivity() {
  if (!usageData) return;
  const days = Usage.activity(usageData, usageState.source);
  activityPoints = Usage.chartPoints(days, usageState.view);
  if (!activityPoints.some(point => point.key === activityKey)) activityKey = activityPoints.at(-1).key;
  $('activity-scope').textContent = window.AgentPawI18n.text("{0} – {1} · 最近 90 天 · {2}", [days[0].key, days.at(-1).key, sourceLabel()]);
  const max = Math.max(1, ...Usage.activity(usageData).map(day => day.tokens));
  if (usageState.view === 'daily') {
    const startWeekday = (new Date(days[0].key + 'T12:00:00').getDay() + 6) % 7;
    const columns = Math.ceil((startWeekday + days.length) / 7);
    let month = '';
    let html = window.AgentPawI18n.text("<div class=\"activity-calendar\" style=\"--weeks:{0}\" aria-label=\"周一至周日排列的 Token 活动\">", [columns]);
    [window.AgentPawI18n.text("一"), '', window.AgentPawI18n.text("三"), '', window.AgentPawI18n.text("五"), '', window.AgentPawI18n.text("日")].forEach((label, i) => { if (label) html += `<span style="grid-column:1;grid-row:${i + 2}" class="calendar-label">${label}</span>`; });
    days.forEach((day, i) => {
      const col = Math.floor((i + startWeekday) / 7) + 2;
      if (day.key.slice(0, 7) !== month) { month = day.key.slice(0, 7); if (i > 0 || Number(day.key.slice(8)) <= 24) html += window.AgentPawI18n.text("<span class=\"calendar-label\" style=\"grid-column:{0};grid-row:1\">{1}月</span>", [col, Number(day.key.slice(5, 7))]); }
      const level = !day.known ? 'missing' : day.tokens > 0 ? Math.min(4, Math.ceil(day.tokens / max * 4)) : 0;
      const label = `${day.key} · ${day.known ? day.tokens.toLocaleString(window.AgentPawI18n.getLanguage()) + ' Token' : window.AgentPawI18n.text("无记录，不代表零用量")}${day.live ? window.AgentPawI18n.text(" · 今日未结束") : ''}`;
      html += `<button type="button" data-day="${day.key}" data-level="${level}" aria-label="${label}" title="${label}" tabindex="${day.key === activityKey ? 0 : -1}" aria-pressed="${day.key === activityKey}" style="grid-column:${col};grid-row:${(i + startWeekday) % 7 + 2}"></button>`;
    });
    html += '</div>';
    const focused = document.activeElement?.dataset?.day;
    if ($('chart').innerHTML !== html) $('chart').innerHTML = html;
    if (focused) $('chart').querySelector(`[data-day="${focused}"]`)?.focus({ preventScroll: true });
    $('activity-legend').innerHTML = window.AgentPawI18n.text("<span>{0} 天有已记录消耗</span><span>少 {1} 多</span><span>统一色阶 · 斜纹为无记录</span>", [days.filter(day => day.tokens > 0).length, [0, 1, 2, 3, 4].map(level => `<i data-level="${level}"></i>`).join('')]);
  } else {
    renderActivityLine();
    $('activity-legend').textContent = usageState.view === 'weekly' ? window.AgentPawI18n.text("周一开始 · 虚线 / 空心点：非完整周或有日期无记录") : window.AgentPawI18n.text("仅累计此 90 天窗口内的已记录用量；空缺日期不补零");
  }
  updateActivityReadout();
}
function renderActivityLine() {
  const width = Math.max(240, $('chart').clientWidth), height = 155, left = 53, right = 12, top = 20, bottom = 29;
  const max = Math.max(1, ...activityPoints.map(point => point.value)) * 1.1;
  const x = i => left + i * (width - left - right) / Math.max(1, activityPoints.length - 1);
  const y = value => height - bottom - value / max * (height - top - bottom);
  let svg = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${usageState.view === 'weekly' ? window.AgentPawI18n.text("每周已记录 Token") : window.AgentPawI18n.text("窗口内已记录累计 Token")}"><text x="${left}" y="11">Token</text>`;
  for (let i = 0; i <= 2; i++) svg += `<line class="activity-grid" x1="${left}" x2="${width - right}" y1="${y(max * i / 2)}" y2="${y(max * i / 2)}"/><text x="${left - 6}" y="${y(max * i / 2) + 4}" text-anchor="end">${fmt(max * i / 2)}</text>`;
  activityPoints.forEach((point, i) => {
    point.x = x(i); point.y = y(point.value);
    const previous = activityPoints[i - 1];
    if (point.known && previous?.known) svg += `<path class="activity-line${point.partial || previous.partial ? ' partial' : ''}" d="M${x(i - 1)},${y(previous.value)} L${x(i)},${y(point.value)}"/>`;
    if (point.known) svg += `<circle class="activity-point${point.partial ? ' partial' : ''}" cx="${x(i)}" cy="${y(point.value)}" r="${usageState.view === 'weekly' ? 3 : 1.7}"/>`;
  });
  [0, Math.floor((activityPoints.length - 1) / 2), activityPoints.length - 1].forEach(i => { svg += `<text x="${x(i)}" y="${height - 5}" text-anchor="${i === 0 ? 'start' : i === activityPoints.length - 1 ? 'end' : 'middle'}">${shortDate(activityPoints[i].key)}</text>`; });
  svg += `<circle id="activity-marker" class="activity-marker" r="4"/><rect data-chart-hit="true" x="${left}" y="${top}" width="${width - left - right}" height="${height - top - bottom}" fill="transparent"/></svg>`;
  $('chart').innerHTML = svg;
}
function updateActivityReadout() {
  const index = activityPoints.findIndex(point => point.key === activityKey), point = activityPoints[index];
  if (!point) return;
  $('activity-prev').disabled = index <= 0;
  $('activity-next').disabled = index === activityPoints.length - 1;
  $('activity-drill').hidden = usageState.view !== 'daily';
  $('activity-drill').disabled = !point.known;
  const label = point.end ? `${point.key} – ${point.end}` : point.key;
  $('hours-readout').textContent = `${label} · ${!point.known ? window.AgentPawI18n.text("无记录，不代表零用量") : fmt(usageState.view === 'daily' ? point.tokens : point.value) + ' Token'}${point.live ? window.AgentPawI18n.text(" · 今日未结束") : point.partial ? window.AgentPawI18n.text(" · 非完整周") : ''}`;
  $('chart').querySelectorAll('[data-day]').forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.day === activityKey)); button.tabIndex = button.dataset.day === activityKey ? 0 : -1; });
  const marker = $('activity-marker');
  if (marker) { marker.style.display = point.known ? '' : 'none'; marker.setAttribute('cx', point.x); marker.setAttribute('cy', point.y); }
}
function initUsageControls() {
  try {
    const saved = JSON.parse(window.localStorage.getItem('agentpaw.panel.usage.v1')) || {};
    for (const [key, options] of Object.entries({ range: ['today', '7d', '30d'], view: ['daily', 'weekly', 'cumulative'], metric: ['tokens', 'cost'], group: ['source', 'model'] })) if (options.includes(saved[key])) usageState[key] = saved[key];
    if (typeof saved.source === 'string') usageState.source = saved.source;
  } catch {}
  const refresh = () => { if (lastStats) { renderUsage(lastStats); renderLive(lastStats); } saveUsagePreferences(); };
  document.querySelectorAll('[data-range],[data-group],[data-metric],[data-view]').forEach(button => button.addEventListener('click', () => {
    for (const key of ['range', 'group', 'metric', 'view']) if (button.dataset[key]) usageState[key] = button.dataset[key];
    if (button.dataset.range) usageState.day = null;
    if (button.dataset.view) activityKey = null;
    if (button.dataset.group) expandedModels = false;
    refresh();
  }));
  $('usage-source').addEventListener('change', () => { usageState.source = $('usage-source').value; expandedModels = false; refresh(); });
  $('clear-day').addEventListener('click', () => { usageState.range = previousRange; usageState.day = null; refresh(); });
  $('show-all-models').addEventListener('click', () => { expandedModels = !expandedModels; renderDistribution(); });
  $('activity-drill').addEventListener('click', () => {
    if (usageState.view !== 'daily' || !activityPoints.find(point => point.key === activityKey)?.known) return;
    if (usageState.range !== 'day') previousRange = usageState.range;
    usageState.range = 'day'; usageState.day = activityKey;
    refresh(); $('usage-period').scrollIntoView({ block: 'start' }); $('clear-day').focus({ preventScroll: true });
  });
  for (const [id, direction] of [['activity-prev', -1], ['activity-next', 1]]) $(id).addEventListener('click', () => {
    const index = activityPoints.findIndex(point => point.key === activityKey);
    activityKey = activityPoints[Math.max(0, Math.min(activityPoints.length - 1, index + direction))]?.key;
    updateActivityReadout();
  });
  $('chart').addEventListener('click', event => {
    const button = event.target.closest('[data-day]');
    if (button) { activityKey = button.dataset.day; updateActivityReadout(); }
    const hit = event.target.closest('[data-chart-hit]');
    if (hit) {
      const rect = hit.getBoundingClientRect();
      const index = Math.max(0, Math.min(activityPoints.length - 1, Math.round((event.clientX - rect.left) / rect.width * (activityPoints.length - 1))));
      activityKey = activityPoints[index].key; updateActivityReadout();
    }
  });
  $('chart').addEventListener('keydown', event => {
    const button = event.target.closest('[data-day]');
    const shift = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }[event.key];
    if (!button || shift === undefined) return;
    event.preventDefault();
    const index = activityPoints.findIndex(point => point.key === button.dataset.day);
    activityKey = activityPoints[Math.max(0, Math.min(activityPoints.length - 1, index + shift))].key;
    updateActivityReadout(); $('chart').querySelector(`[data-day="${activityKey}"]`).focus();
  });
  $('chart').addEventListener('focusin', event => { if (event.target.dataset.day) { activityKey = event.target.dataset.day; updateActivityReadout(); } });
  let chartWidth = 0;
  new ResizeObserver(entries => { const width = entries[0].contentRect.width; if (width !== chartWidth) { chartWidth = width; renderActivity(); } }).observe($('chart'));
}
