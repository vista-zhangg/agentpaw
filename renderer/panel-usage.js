'use strict';

const Usage = window.AgentPawUsage;
const tx = (source, vars) => window.AgentPawI18n.text(source, vars);
const usageState = { source: 'all', range: '7d', day: null, metric: 'tokens', group: 'source' };
const PREFS_KEY = 'agentpaw.panel.usage.v2';
let usageData = null, usageSelection = null, previousRange = '7d', rankExpanded = false, chartFocus = -1;

// Series colors follow the entity, never its rank (validated categorical order).
const SOURCE_COLOR = { codex: '#2a78d6', claude: '#eb6834', workbuddy: '#6250d6', opencode: '#1baf7a' };
// Stack and list tools in this order so adjacent colors stay distinguishable.
const SOURCE_ORDER = ['codex', 'claude', 'workbuddy', 'opencode'];
function orderedSources(rows) {
  const rank = id => { const i = SOURCE_ORDER.indexOf(id); return i < 0 ? SOURCE_ORDER.length : i; };
  return [...rows].sort((a, b) => rank(a.id) - rank(b.id));
}
const SLOT_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const OTHER_COLOR = '#a3a39d', MISSING_MODEL = 'missing:';
let modelColors = new Map();

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}
function fmt(n) {
  n = Number(n) || 0;
  return n >= 1e9 ? (n / 1e9).toFixed(2) + 'B'
    : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e8 ? 0 : n >= 1e7 ? 1 : 2) + 'M'
    : n >= 1e3 ? (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'K'
    : Math.round(n).toLocaleString(window.AgentPawI18n.getLanguage());
}
function exactNumber(n) { return Math.round(Number(n) || 0).toLocaleString(window.AgentPawI18n.getLanguage()); }
function usd(n) { return !(n > 0) ? '$0.00' : n < .01 ? '<$0.01' : n >= 1000 ? '$' + Math.round(n).toLocaleString('en-US') : '$' + n.toFixed(2); }
function clockText(ts) { return new Date(ts).toLocaleTimeString(window.AgentPawI18n.getLanguage(), { hour: '2-digit', minute: '2-digit', hour12: false }); }
function shortDate(key) { return `${Number(key.slice(5, 7))}/${Number(key.slice(8))}`; }
function weekday(key) { return [tx('周日'), tx('周一'), tx('周二'), tx('周三'), tx('周四'), tx('周五'), tx('周六')][new Date(key + 'T12:00:00').getDay()]; }
function dayName(key) {
  if (!usageSelection) return shortDate(key);
  if (key === usageSelection.today) return tx('今天');
  if (key === Usage.offset(usageSelection.today, -1)) return tx('昨天');
  return `${shortDate(key)} ${weekday(key)}`;
}
function sourceLabel(id) { return id === 'all' ? tx('全部工具') : usageData?.sources.find(row => row.id === id)?.label || id; }
function sourceColor(id) {
  if (SOURCE_COLOR[id]) return SOURCE_COLOR[id];
  const index = (usageData?.sources || []).findIndex(row => row.id === id);
  return SLOT_COLORS[(index + 4) % SLOT_COLORS.length];
}
function modelName(row) { return row.id === MISSING_MODEL ? tx('模型明细缺失') : row.name; }
function modelColor(id) { return id === MISSING_MODEL ? '#c9cbd1' : modelColors.get(id) || OTHER_COLOR; }
function effectiveGroup() { return usageState.source !== 'all' ? 'model' : usageState.group; }

/* ---------- tooltip ---------- */
const tip = document.getElementById('tip');
function showTip(x, y, { title, value, rows = [], foot }) {
  tip.replaceChildren();
  if (title) tip.append(el('div', 'tip-title', title));
  if (value != null) tip.append(el('div', 'tip-value', value));
  for (const row of rows) {
    const line = el('div', 'tip-row');
    const key = el('i');
    key.style.background = row.color || 'transparent';
    line.append(key, el('span', '', row.name), el('b', '', row.value ?? ''));
    tip.append(line);
  }
  if (foot) tip.append(el('div', 'tip-foot', foot));
  tip.classList.add('show');
  const w = tip.offsetWidth, h = tip.offsetHeight;
  let left = x + 14, top = y - h - 12;
  if (left + w > window.innerWidth - 8) left = x - w - 14;
  if (top < 8) top = y + 16;
  tip.style.left = Math.max(8, left) + 'px';
  tip.style.top = Math.min(window.innerHeight - h - 8, top) + 'px';
}
function hideTip() { tip.classList.remove('show'); }
function hoverTip(node, content) {
  node.addEventListener('pointermove', event => showTip(event.clientX, event.clientY, content()));
  node.addEventListener('pointerleave', hideTip);
}

/* ---------- preferences ---------- */
function saveUsagePreferences() {
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify({ source: usageState.source, range: usageState.range === 'day' ? previousRange : usageState.range, metric: usageState.metric, group: usageState.group }));
  } catch {}
}
function loadUsagePreferences() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(PREFS_KEY)) || {};
    for (const [key, options] of Object.entries({ range: ['today', '7d', '30d', '90d'], metric: ['tokens', 'cost'], group: ['source', 'model'] })) {
      if (options.includes(saved[key])) usageState[key] = saved[key];
    }
    if (typeof saved.source === 'string') usageState.source = saved.source;
    previousRange = usageState.range;
  } catch {}
}

/* ---------- render ---------- */
function renderUsage(s) {
  if (!s.usage || s.usage.version !== 1) {
    $('usage-warning').hidden = false;
    $('usage-warning').textContent = tx('用量数据尚未就绪，请等待下一次更新。');
    return;
  }
  usageData = s.usage;
  if (usageState.source !== 'all' && !usageData.sources.some(row => row.id === usageState.source)) usageState.source = 'all';
  const all = Usage.sources(usageData, 'all');
  const today = Usage.dayKey(usageData.asOf);
  const window90 = Array.from({ length: 90 }, (_, i) => Usage.offset(today, i - 89));
  modelColors = new Map(Usage.models(all, window90).filter(row => row.id !== MISSING_MODEL)
    .sort((a, b) => b.tokens - a.tokens).map((row, i) => [row.id, SLOT_COLORS[i] || OTHER_COLOR]));
  usageSelection = Usage.selection(usageData, usageState);
  renderFilters();
  renderScope();
  renderKpis();
  renderTrend();
  renderComposition();
  renderRanking();
  renderLifetime();
}

function renderFilters() {
  document.querySelectorAll('[data-range]').forEach(button => button.setAttribute('aria-pressed', String(usageState.range !== 'day' && button.dataset.range === usageState.range)));
  document.querySelectorAll('[data-metric]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.metric === usageState.metric)));
  document.querySelectorAll('[data-group]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.group === effectiveGroup()));
    button.disabled = button.dataset.group === 'source' && usageState.source !== 'all';
  });
  const tabs = $('source-tabs');
  const sources = orderedSources(usageData.sources.filter(row => row.available || row.id === usageState.source));
  const signature = sources.map(row => row.id).join(',') + '|' + window.AgentPawI18n.getLanguage();
  if (tabs.dataset.signature !== signature) {
    tabs.dataset.signature = signature;
    tabs.replaceChildren();
    const all = el('button', '', tx('全部'));
    all.type = 'button';
    all.dataset.source = 'all';
    tabs.append(all);
    for (const row of sources) {
      const button = el('button');
      button.type = 'button';
      button.dataset.source = row.id;
      const swatch = el('i', 'swatch');
      swatch.style.background = sourceColor(row.id);
      button.append(swatch, document.createTextNode(row.label));
      tabs.append(button);
    }
  }
  tabs.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.source === usageState.source)));
  const chips = $('chips');
  chips.replaceChildren();
  if (usageState.range === 'day') {
    const chip = el('span', 'chip', dayName(usageState.day));
    const clear = el('button', '', '✕');
    clear.type = 'button';
    clear.setAttribute('aria-label', tx('返回周期统计'));
    clear.title = tx('返回周期统计');
    clear.addEventListener('click', () => { usageState.range = previousRange; usageState.day = null; refreshUsage(); });
    chip.append(clear);
    chips.append(chip);
  }
}

function renderScope() {
  const sel = usageSelection;
  const period = usageState.range === 'day' ? dayName(usageState.day)
    : { today: tx('今日'), '7d': tx('近 7 天'), '30d': tx('近 30 天'), '90d': tx('近 90 天') }[usageState.range];
  const dates = sel.keys.length > 1 ? ` · ${shortDate(sel.start)}–${shortDate(sel.end)}` : '';
  const live = sel.end === sel.today ? ' · ' + tx('截至 {0}', [clockText(usageData.asOf)]) : '';
  $('usage-period').textContent = `${period}${dates} · ${sourceLabel(usageState.source)}${live}`;
  const unavailable = Usage.sources(usageData, usageState.source).filter(row => row.unavailable).map(row => row.label);
  $('usage-warning').hidden = !unavailable.length;
  $('usage-warning').textContent = unavailable.length ? tx('{0} 暂时读不到数据', [unavailable.join('、')]) : '';
}

function sparkline(values) {
  const points = values.map((v, i) => [i, v]).filter(([, v]) => v != null);
  if (points.length < 2) return null;
  const W = 100, H = 26, n = values.length - 1;
  const max = Math.max(...points.map(p => p[1])), min = Math.min(0, ...points.map(p => p[1]));
  const xy = ([i, v]) => [(i / n * W).toFixed(1), (H - 2 - (v - min) / (max - min || 1) * (H - 4)).toFixed(1)];
  const line = points.map((p, j) => (j ? 'L' : 'M') + xy(p).join(',')).join(' ');
  const last = xy(points.at(-1));
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = `<path d="${line} L${xy(points.at(-1))[0]},${H} L${xy(points[0])[0]},${H} Z" fill="#2a78d6" fill-opacity=".08"/><path d="${line}" fill="none" stroke="#2a78d6" stroke-width="1.5" vector-effect="non-scaling-stroke" stroke-linejoin="round"/><circle cx="${last[0]}" cy="${last[1]}" r="2.2" fill="#2a78d6"/>`;
  return svg;
}

function renderKpis() {
  const sel = usageSelection, row = sel.current, a = sel.compareCurrent, b = sel.previous;
  const vs = usageState.range === 'day' ? tx('较前一日') : tx('较上期');
  const compareTitle = usageState.range === 'day' ? '' : tx('按完整日比较：前 {0} 天对比上一周期同一位置', [sel.compareKeys.length]);
  const delta = (current, previous) => sel.comparable ? Usage.change(current, previous) : null;
  const rateDelta = sel.comparable && a.cacheRate != null && b.cacheRate != null
    ? (Math.abs(a.cacheRate - b.cacheRate) < .1 ? tx('持平') : `${a.cacheRate > b.cacheRate ? '↑' : '↓'} ${tx('{0} 点', [Math.abs(a.cacheRate - b.cacheRate).toFixed(1)])}`)
    : null;
  const buckets = sel.keys.length > 1 ? Usage.daily(usageData, sel, usageState.source) : [];
  const series = key => buckets.map(day => day.total.known ? key(day.total) : null);
  const days = Math.max(1, sel.keys.length);
  const items = [
    { label: 'Token', value: row.known ? fmt(row.tokens) : '—', exact: row.known ? exactNumber(row.tokens) + ' Token' : null,
      delta: delta(a.tokens, b.tokens), fallback: days > 1 && row.known ? tx('日均 {0}', [fmt(row.tokens / days)]) : '', spark: series(r => r.tokens) },
    { label: tx('估算费用'), value: row.known ? usd(row.cost) : '—', exact: row.known ? '$' + row.cost.toFixed(4) : null,
      delta: delta(a.cost, b.cost), fallback: row.cost > 0 ? tx('均价 {0}/M', [usd(row.cost / row.tokens * 1e6)]) : '', spark: series(r => r.cost) },
    { label: tx('缓存命中'), value: row.cacheRate == null ? '—' : row.cacheRate.toFixed(1) + '%',
      exact: row.cacheRate == null ? null : tx('缓存读取 {0} ÷ 输入 {1}', [fmt(row.cacheRead), fmt(row.inputTotal)]),
      delta: rateDelta, fallback: row.cacheRead > 0 ? tx('读取 {0}', [fmt(row.cacheRead)]) : '', spark: series(r => r.cacheRate) },
    { label: tx('请求'), value: row.known ? exactNumber(row.messages) : '—', exact: null,
      delta: delta(a.messages, b.messages), fallback: row.messages > 0 ? tx('每次约 {0}', [fmt(row.tokens / row.messages)]) : '', spark: series(r => r.messages) },
  ];
  const box = $('kpis');
  box.replaceChildren();
  for (const item of items) {
    const card = el('div', 'kpi');
    const foot = el('div', 'kpi-foot');
    if (item.delta) {
      foot.append(el('b', '', item.delta), document.createTextNode(' ' + vs));
      foot.title = compareTitle;
    } else foot.textContent = item.fallback;
    const value = el('div', 'kpi-value', item.value);
    if (item.exact) value.title = item.exact;
    card.append(el('div', 'kpi-label', item.label), value, foot);
    const spark = sparkline(item.spark);
    if (spark) card.append(spark);
    box.append(card);
  }
}

function chartSeries(sel) {
  if (effectiveGroup() === 'source') {
    return orderedSources(usageData.sources.filter(source => sel.bySource.some(row => row.id === source.id)))
      .map(source => ({ id: source.id, name: source.label, color: sourceColor(source.id), value: (b, m) => Number(b.bySource[source.id]?.[m]) || 0 }));
  }
  const metric = usageState.metric;
  const ranked = [...sel.byModel].sort((a, b) => b[metric] - a[metric] || b.tokens - a.tokens);
  const keep = ranked.slice(0, ranked.length > 6 ? 5 : 6);
  const rest = ranked.filter(row => !keep.includes(row));
  const order = id => id === MISSING_MODEL ? 98 : [...modelColors.keys()].indexOf(id);
  const out = keep.sort((a, b) => order(a.id) - order(b.id))
    .map(row => ({ id: row.id, name: modelName(row), color: modelColor(row.id), value: (b, m) => Number(b.byModel[row.id]?.[m]) || 0 }));
  if (rest.length) out.push({ id: 'other', name: tx('其他'), color: OTHER_COLOR, value: (b, m) => rest.reduce((n, row) => n + (Number(b.byModel[row.id]?.[m]) || 0), 0) });
  return out;
}

function niceMax(v) {
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  for (const s of [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]) if (s * p >= v) return s * p;
  return 10 * p;
}
function metricText(value) { return usageState.metric === 'cost' ? usd(value) : fmt(value); }

function renderTrend() {
  const sel = usageSelection;
  const block = $('trend-block'), controls = document.querySelector('.view-controls');
  const multi = sel.keys.length > 1;
  block.hidden = !multi;
  const host = multi ? block.querySelector('.block-title') : $('rank-block').querySelector('.block-title');
  if (controls.parentElement !== host) host.append(controls);
  if (!multi) { hideTip(); return; }
  const buckets = Usage.daily(usageData, sel, usageState.source);
  const series = chartSeries(sel);
  const metric = usageState.metric;
  const box = $('chart');
  const W = Math.max(240, box.clientWidth), H = 176, L = 46, R = 4, T = 8, B = 24;
  const n = buckets.length;
  const totals = buckets.map(b => series.reduce((sum, s) => sum + s.value(b, metric), 0));
  const max = niceMax(Math.max(...totals, metric === 'cost' ? .01 : 1));
  const pw = W - L - R, ph = H - T - B, slot = pw / n, gap = n > 40 ? 1 : n > 20 ? 2 : 4, bw = Math.max(1.5, slot - gap);
  const y = v => T + ph - v / max * ph;
  let svg = `<svg viewBox="0 0 ${W} ${H}" height="${H}" tabindex="0" role="img" aria-label="${escapeAttr(tx('每日用量，方向键逐日查看，Enter 查看当天'))}">`;
  for (let i = 0; i <= 2; i++) {
    const v = max * i / 2;
    svg += `<line class="gridline" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 4}" text-anchor="end">${escapeAttr(metricText(v))}</text>`;
  }
  const labels = n <= 7 ? buckets.map((_, i) => i) : [0, Math.round((n - 1) / 3), Math.round((n - 1) * 2 / 3), n - 1];
  for (const i of labels) {
    const key = buckets[i].key, anchor = n <= 7 ? 'middle' : i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle';
    const x = anchor === 'start' ? L + i * slot : anchor === 'end' ? L + (i + 1) * slot : L + i * slot + slot / 2;
    svg += `<text x="${x}" y="${H - 6}" text-anchor="${anchor}">${escapeAttr(key === sel.today ? tx('今天') : n <= 7 ? weekday(key) : shortDate(key))}</text>`;
  }
  svg += '<g class="bars">';
  buckets.forEach((bucket, i) => {
    const x = L + i * slot + gap / 2;
    svg += `<g data-i="${i}"${bucket.live ? ' class="live"' : ''}>`;
    const parts = series.map(s => [s, s.value(bucket, metric)]).filter(([, v]) => v > 0);
    let acc = 0;
    parts.forEach(([s, v], j) => {
      const y0 = y(acc), y1 = y(acc + v);
      acc += v;
      const h = y0 - y1;
      if (h < .5) return;
      if (j === parts.length - 1) {
        const r = Math.min(3, bw / 2, h);
        svg += `<path fill="${s.color}" d="M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + bw - r} Q${x + bw},${y1} ${x + bw},${y1 + r} V${y0} Z"/>`;
      } else {
        const hh = Math.max(.5, h - 1.5);
        svg += `<rect fill="${s.color}" x="${x}" y="${y0 - hh}" width="${bw}" height="${hh}"/>`;
      }
    });
    svg += '</g>';
  });
  svg += `</g><rect x="${L}" y="${T}" width="${pw}" height="${ph + B}" fill="transparent" style="cursor:pointer"/></svg>`;
  box.innerHTML = svg;
  const chart = box.querySelector('svg'), bars = chart.querySelector('.bars');
  const indexAt = clientX => {
    const r = chart.getBoundingClientRect();
    return Math.max(0, Math.min(n - 1, Math.floor((clientX - r.left - L * r.width / W) / (slot * r.width / W))));
  };
  const highlight = (i, x, yPos) => {
    bars.classList.add('dim');
    bars.querySelectorAll('g[data-i]').forEach(g => g.classList.toggle('on', Number(g.dataset.i) === i));
    const bucket = buckets[i];
    const rows = series.map(s => ({ name: s.name, color: s.color, v: s.value(bucket, metric) })).filter(r => r.v > 0)
      .sort((a, b) => b.v - a.v).map(r => ({ ...r, value: metricText(r.v) }));
    showTip(x, yPos, {
      title: dayName(bucket.key) + (bucket.live ? ' · ' + tx('进行中') : ''),
      value: bucket.total.known ? metricText(totals[i]) : tx('没有记录'),
      rows,
      foot: bucket.total.known ? tx('点击查看这一天') : null,
    });
  };
  const clear = () => { bars.classList.remove('dim'); hideTip(); };
  const drill = i => {
    const bucket = buckets[i];
    if (!bucket || !bucket.total.known) return;
    hideTip();
    if (usageState.range !== 'day') previousRange = usageState.range;
    usageState.range = 'day';
    usageState.day = bucket.key;
    chartFocus = -1;
    refreshUsage();
  };
  chart.addEventListener('pointermove', event => highlight(indexAt(event.clientX), event.clientX, event.clientY));
  chart.addEventListener('pointerleave', clear);
  chart.addEventListener('blur', clear);
  chart.addEventListener('click', event => drill(indexAt(event.clientX)));
  chart.addEventListener('keydown', event => {
    const step = { ArrowLeft: -1, ArrowRight: 1, Home: -n, End: n }[event.key];
    if (step != null) {
      event.preventDefault();
      chartFocus = Math.max(0, Math.min(n - 1, (chartFocus < 0 ? n - 1 : chartFocus) + step));
      const r = chart.getBoundingClientRect();
      highlight(chartFocus, r.left + (L + chartFocus * slot + slot / 2) * r.width / W, r.top + 30);
    }
    if (event.key === 'Enter' && chartFocus >= 0) drill(chartFocus);
  });
  const legend = $('legend');
  legend.replaceChildren();
  for (const s of series) {
    const item = el('span');
    const swatch = el('i', 'swatch');
    swatch.style.background = s.color;
    const total = buckets.reduce((sum, b) => sum + s.value(b, metric), 0);
    if (!(total > 0)) continue;
    item.append(swatch, document.createTextNode(s.name + ' '), el('b', '', metricText(total)));
    legend.append(item);
  }
}
function escapeAttr(value) { return String(value).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function renderComposition() {
  const row = usageSelection.current;
  const block = $('comp-block');
  block.hidden = !row.known || !(row.tokens > 0);
  if (block.hidden) return;
  const normal = row.normalInput ?? Math.max(0, row.inputTotal - row.cacheRead - row.cacheWrite);
  const unsplit = Math.max(0, row.tokens - row.inputTotal - row.output);
  const parts = [
    { name: tx('缓存读取'), value: row.cacheRead, color: '#1c5cab' },
    { name: tx('缓存写入'), value: row.cacheWrite, color: '#6da7ec' },
    { name: tx('普通输入'), value: normal, color: '#b7d3f6' },
    { name: tx('输出'), value: row.output, color: '#eb6834', note: row.reasoningOutput > 0 ? tx('含推理 {0}', [fmt(row.reasoningOutput)]) : '' },
    { name: tx('未分项'), value: unsplit, color: '#d5d7dc' },
  ].filter(part => part.value > 0);
  const total = row.tokens;
  const bar = $('compbar'), legend = $('complegend');
  bar.replaceChildren();
  legend.replaceChildren();
  for (const part of parts) {
    const share = (part.value / total * 100).toFixed(1) + '%';
    const segment = el('div');
    segment.style.width = part.value / total * 100 + '%';
    segment.style.background = part.color;
    hoverTip(segment, () => ({ title: part.name, value: exactNumber(part.value) + ' Token', rows: [{ name: tx('占全部 Token'), value: share }] }));
    bar.append(segment);
    const item = el('div');
    const key = el('div', 'comp-key');
    const swatch = el('i', 'swatch');
    swatch.style.background = part.color;
    key.append(swatch, document.createTextNode(part.name));
    const value = el('div', 'comp-value num', fmt(part.value));
    value.title = exactNumber(part.value) + ' Token';
    item.append(key, value, el('div', 'comp-share', share + (part.note ? ' · ' + part.note : '')));
    legend.append(item);
  }
  $('comp-meta').textContent = tx('输入 {0} · 输出 {1}', [fmt(row.inputTotal), fmt(row.output)]);
}

function renderRanking() {
  const sel = usageSelection, metric = usageState.metric;
  const bySource = effectiveGroup() === 'source';
  const rows = (bySource
    ? sel.bySource.map(row => ({ ...row, color: sourceColor(row.id), clickable: true }))
    : sel.byModel.map(row => ({ ...row, name: modelName(row), color: modelColor(row.id), cacheRate: undefined })))
    .sort((a, b) => b[metric] - a[metric] || b.tokens - a.tokens);
  const total = rows.reduce((sum, row) => sum + row[metric], 0);
  const top = rows[0] ? rows[0][metric] : 0;
  $('rank-title').textContent = bySource ? tx('按工具排行') : tx('按模型排行');
  $('rank-hint').textContent = bySource && rows.length > 1 ? tx('点一行只看该工具') : '';
  $('rank-col').textContent = bySource ? tx('工具') : tx('模型');
  const table = document.querySelector('.rank-table');
  table.classList.toggle('no-rate', !bySource);
  $('rank-rate-col').hidden = !bySource;
  const body = $('rank-rows');
  body.replaceChildren();
  if (!rows.length) {
    const tr = el('tr'), td = el('td', 'empty', tx('这段时间没有用量'));
    td.colSpan = 5;
    tr.append(td);
    body.append(tr);
  }
  for (const row of rows.slice(0, rankExpanded ? rows.length : 8)) {
    const tr = el('tr');
    const share = total > 0 ? row[metric] / total * 100 : 0;
    const name = el('td');
    const head = el('div', 'rank-name');
    const swatch = el('i', 'swatch');
    swatch.style.background = row.color;
    head.append(swatch, el('span', '', row.name), el('span', 'rank-share', total > 0 && row[metric] > 0 ? share.toFixed(1) + '%' : '—'));
    head.title = row.name;
    const bar = el('div', 'rank-bar'), fill = el('b');
    fill.style.width = (top > 0 ? row[metric] / top * 100 : 0) + '%';
    fill.style.background = row.color;
    bar.append(fill);
    name.append(head, bar);
    const tokens = el('td', '', fmt(row.tokens));
    tokens.title = exactNumber(row.tokens) + ' Token';
    const cost = el('td', row.cost > 0 ? '' : 'muted', row.cost > 0 ? usd(row.cost) : row.tokens > 0 ? '—' : usd(0));
    if (!(row.cost > 0) && row.tokens > 0) cost.title = tx('价目表里没有对应价格');
    tr.append(name, tokens, cost);
    if (bySource) tr.append(el('td', row.cacheRate == null ? 'muted' : '', row.cacheRate == null ? '—' : row.cacheRate.toFixed(1) + '%'));
    tr.append(el('td', row.cost > 0 ? '' : 'muted', row.cost > 0 && row.tokens > 0 ? usd(row.cost / row.tokens * 1e6) : '—'));
    if (row.clickable && sel.bySource.length > 1) {
      tr.classList.add('clickable');
      tr.tabIndex = 0;
      const pick = () => setSource(row.id);
      tr.addEventListener('click', pick);
      tr.addEventListener('keydown', event => { if (event.key === 'Enter') pick(); });
    }
    if (bySource && usageState.source === row.id) tr.classList.add('selected');
    body.append(tr);
  }
  const more = $('show-all');
  more.hidden = rows.length <= 8;
  more.textContent = rankExpanded ? tx('收起') : tx('展开全部 {0} 项', [rows.length]);
}

function renderLifetime() {
  const lifetime = Usage.sum(Usage.sources(usageData, usageState.source).flatMap(source => source.lifetime ? [source.lifetime] : []));
  const footer = $('lifetime');
  footer.replaceChildren();
  if (lifetime.known && lifetime.tokens > 0) {
    const part = (label, value, title) => {
      const span = el('span');
      if (label) span.append(document.createTextNode(label + ' '));
      const b = el('b', 'num', value);
      if (title) b.title = title;
      span.append(b);
      footer.append(span);
    };
    part(tx('累计'), fmt(lifetime.tokens) + ' Token', exactNumber(lifetime.tokens) + ' Token');
    part('', usd(lifetime.cost));
    part('', tx('{0} 次请求', [exactNumber(lifetime.messages)]));
  }
  footer.append(el('span', 'updated', tx('更新于 {0}', [clockText(usageData.asOf)])));
}

function setSource(id) {
  usageState.source = usageState.source === id ? 'all' : id;
  rankExpanded = false;
  refreshUsage();
}
function refreshUsage() {
  if (lastStats) renderUsage(lastStats);
  saveUsagePreferences();
}
function closeInfo() {
  if ($('info-pop').hidden) return false;
  $('info-pop').hidden = true;
  $('info-btn').setAttribute('aria-expanded', 'false');
  return true;
}

function initUsageControls() {
  loadUsagePreferences();
  document.querySelectorAll('[data-range]').forEach(button => button.addEventListener('click', () => {
    usageState.range = button.dataset.range;
    previousRange = usageState.range;
    usageState.day = null;
    refreshUsage();
  }));
  document.querySelectorAll('[data-metric]').forEach(button => button.addEventListener('click', () => { usageState.metric = button.dataset.metric; refreshUsage(); }));
  document.querySelectorAll('[data-group]').forEach(button => button.addEventListener('click', () => {
    if (button.disabled) return;
    usageState.group = button.dataset.group;
    rankExpanded = false;
    refreshUsage();
  }));
  $('source-tabs').addEventListener('click', event => {
    const button = event.target.closest('button');
    if (!button) return;
    usageState.source = button.dataset.source;
    rankExpanded = false;
    refreshUsage();
  });
  $('show-all').addEventListener('click', () => { rankExpanded = !rankExpanded; renderRanking(); });
  $('info-btn').addEventListener('click', event => {
    event.stopPropagation();
    if (closeInfo()) return;
    const pop = $('info-pop'), zone = $('stats-zone');
    pop.style.top = (event.currentTarget.getBoundingClientRect().bottom - zone.getBoundingClientRect().top + 6) + 'px';
    pop.hidden = false;
    event.currentTarget.setAttribute('aria-expanded', 'true');
  });
  document.addEventListener('click', event => { if (!event.target.closest('#info-pop')) closeInfo(); });
  const filterbar = $('filterbar');
  window.addEventListener('scroll', () => {
    filterbar.classList.toggle('stuck', filterbar.getBoundingClientRect().top <= 0);
    hideTip();
  }, { passive: true });
  let chartWidth = 0;
  new ResizeObserver(entries => {
    const width = entries[0].contentRect.width;
    if (width !== chartWidth && usageSelection) { chartWidth = width; renderTrend(); }
  }).observe($('chart'));
}
