'use strict';

// SVG icon set — replaces emoji glyphs so the UI renders identically on every
// machine and matches the AgentPaw art style (no system-font emoji jitter).
//
// Each icon is a raw SVG string sized 1em via `width=1em height=1em` so it
// inherits font-size and color (fill=currentColor) — drop them inline anywhere
// a glyph used to sit, no extra CSS class needed for default layout.
//
// USAGE:
//   const html = icon('check')                 → inline SVG string
//   const out  = withIcons('✅ 已允许')          → emoji → SVG, text otherwise
//   setTextWithIcons(el, '💬 hello')           → safe text→innerHTML pipeline
//
// `withIcons` is XSS-safe IF the caller treats the OUTPUT as innerHTML AND the
// input text was previously escaped (it textContent-encodes the surrounding
// text via `escapeHtml`, only the icon name is trusted).

(function (root) {
  // 24x24 viewBox, outline+fill strokes mostly. Pure SVG, no fonts.
  // Picked to match the AgentPaw art language: clean rounded lines, no gradients.
  const ICONS = {
    // ✅ 完成/允许
    check: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5 L10 17.5 L19 7"/></svg>',
    // 💬 对话/说
    chat: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 6.5C4 5.4 4.9 4.5 6 4.5h12c1.1 0 2 .9 2 2v8c0 1.1-.9 2-2 2h-7l-4 3.5v-3.5H6c-1.1 0-2-.9-2-2v-8z"/></svg>',
    // ✋ 等待/请示
    hand: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8 11V4.8a1.3 1.3 0 0 1 2.6 0V11"/><path d="M10.6 10.4V3.5a1.3 1.3 0 0 1 2.6 0V11"/><path d="M13.2 10.4V4.2a1.3 1.3 0 0 1 2.6 0V12"/><path d="M15.8 10V6.4a1.3 1.3 0 0 1 2.6 0v8.6c0 3.6-2.7 6-6 6-2.7 0-4.6-1.4-5.6-3.6L4.6 13.4a1.4 1.4 0 0 1 2.2-1.7L8 13.2"/></svg>',
    // 💤 睡眠
    zzz: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 7h6l-6 8h6"/><path d="M13 12h5l-5 6h5"/></svg>',
    // 📊 详情/图表
    chart: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20V4"/><path d="M4 20h16"/><path d="M8 18v-6"/><path d="M12 18V8"/><path d="M16 18v-4"/></svg>',
    // 📄 日志/文件
    doc: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 17h6"/></svg>',
    // 🔔 铃铛
    bell: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6.5 16.5V11a5.5 5.5 0 1 1 11 0v5.5l1.5 2h-14z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg>',
    // Settings gear, shared by popup headers and pet menus.
    settings: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 3-.5 2-2 1.2-2-.6-3 5.2L3 12l-1.5 1.2 3 5.2 2-.6 2 1.2.5 2h6l.5-2 2-1.2 2 .6 3-5.2L21 12l1.5-1.2-3-5.2-2 .6-2-1.2L15 3z"/><circle cx="12" cy="12" r="3"/></svg>',
    // — 收起/隐藏
    minus: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/></svg>',
    close: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    star: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linejoin="round" aria-hidden="true"><path d="M12 4l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.4l-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z"/></svg>',
    starFill: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true"><path d="M12 4l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 16.4l-4.8 2.5.9-5.4-3.9-3.8 5.4-.8z"/></svg>',
    edit: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>',
    terminal: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4.5" width="18" height="15" rx="3"/><path d="M7.5 9.5l3 2.5-3 2.5M12.5 15h4"/></svg>',
    chevron: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
    cup: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 8h11v6a5 5 0 0 1-5 5h-1a5 5 0 0 1-5-5z"/><path d="M16 10h1.5a2.5 2.5 0 0 1 0 5H16"/><path d="M9 3.5c-.6.9-.6 1.6 0 2.5M12.5 3.5c-.6.9-.6 1.6 0 2.5"/></svg>',
  };

  // Tool marks shared by the pet popovers and the detail panel.
  const AGENTS = {
    claude: '<svg viewBox="0 0 24 24" fill="#d97757" aria-hidden="true"><path d="M12 1l2.2 6.3L20.5 5l-4 5.4 6.5 1.6-6.5 1.6 4 5.4-6.3-2.3L12 23l-2.2-6.3L3.5 19l4-5.4L1 12l6.5-1.6-4-5.4 6.3 2.3z"/></svg>',
    codex: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" fill="#3b82f6"/><path d="M7 8l4 4-4 4" stroke="#fff" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/><path d="M13 16.5h4.5" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/></svg>',
    workbuddy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" fill="#6d5efc"/><path d="M12 6l1.35 3.65L17 11l-3.65 1.35L12 16l-1.35-3.65L7 11l3.65-1.35z" fill="#fff"/></svg>',
    opencode: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2" y="2" width="20" height="20" rx="5" fill="#17181c"/><path d="M8.5 6.5v11L17.5 12z" fill="#ff5f1f"/></svg>',
  };
  function agent(name) {
    return AGENTS[name] || AGENTS.claude;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]));
  }

  function icon(name) {
    return ICONS[name] || '';
  }

  // emoji code-point → icon name. Add to this map as we wire more icons in.
  const EMOJI_TO_ICON = {
    '✅': 'check',
    '💬': 'chat',
    '✋': 'hand',
    '💤': 'zzz',
    '📊': 'chart',
    '📄': 'doc',
    '🔔': 'bell',
  };

  const EMOJI_SRC = '(' + Object.keys(EMOJI_TO_ICON).map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')';
  const EMOJI_RE = new RegExp(EMOJI_SRC, 'g');       // for replace-all in withIcons
  const EMOJI_TEST_RE = new RegExp(EMOJI_SRC);       // no /g — .test() must be stateless

  // Take a plain string, escape it (HTML-safe), then swap known emoji for SVG.
  // Output is intended for innerHTML; surrounding user text is already escaped.
  function withIcons(text) {
    const escaped = escapeHtml(text);
    return escaped.replace(EMOJI_RE, (e) => '<span class="oi">' + (ICONS[EMOJI_TO_ICON[e]] || e) + '</span>');
  }

  function setTextWithIcons(el, text) {
    if (!el) return;
    el.innerHTML = withIcons(text == null ? '' : String(text));
  }

  // Detect: does this string contain any of our mapped emoji? If not, callers
  // can keep using textContent for speed — useful in hot paths.
  function hasMappedEmoji(text) {
    // Use the non-global regex: a /g regex's .test() advances lastIndex and
    // wouldn't reset, so repeated calls on the same string flip true/false/true…
    return EMOJI_TEST_RE.test(String(text == null ? '' : text));
  }

  root.AgentPawIcons = { icon, agent, withIcons, setTextWithIcons, hasMappedEmoji, EMOJI_TO_ICON };
})(typeof window !== 'undefined' ? window : globalThis);
