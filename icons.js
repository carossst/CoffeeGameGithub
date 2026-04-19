// icons.js v1.0 - inline SVG icon helpers

(() => {
  "use strict";

  const ICONS = {
    "help-circle": `
      <circle cx="10" cy="10" r="7"></circle>
      <path d="M7.9 7.4a2.4 2.4 0 0 1 4.2 1.6c0 1.6-1.7 2.2-2.1 2.9"></path>
      <circle cx="10" cy="14.2" r="0.8" fill="currentColor" stroke="none"></circle>
    `,
    home: `
      <path d="M3.4 8.6L10 3.4l6.6 5.2"></path>
      <path d="M5.4 7.9V16h9.2V7.9"></path>
    `,
    zap: `
      <path d="M10.7 2.8L5.9 10h3.5l-0.7 7.2 5.4-7.8h-3.5l0.1-6.6z"></path>
    `,
    "chevron-right": `
      <path d="M7 5l6 5-6 5"></path>
    `,
    check: `
      <path d="M4.8 10.4l3.2 3.2 7.2-7.2"></path>
    `,
    x: `
      <path d="M5 5l10 10"></path>
      <path d="M15 5L5 15"></path>
    `
  };

  function renderIcon(name, options = {}) {
    const path = ICONS[String(name || "").trim()];
    if (!path) return "";

    const escapeHtml = window.WT_UTILS && typeof window.WT_UTILS.escapeHtml === "function"
      ? window.WT_UTILS.escapeHtml
      : (s) => String(s);
    const cls = String(options.className || "").trim();
    const label = String(options.label || "").trim();
    const hidden = label ? "" : ` aria-hidden="true"`;
    const labelAttr = label ? ` role="img" aria-label="${escapeHtml(label)}"` : "";

    return `
      <svg class="wt-icon${cls ? ` ${cls}` : ""}" viewBox="0 0 20 20" width="20" height="20"${hidden}${labelAttr} fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false">
        ${path}
      </svg>
    `;
  }

  window.WT_ICONS = {
    renderIcon
  };
})();
