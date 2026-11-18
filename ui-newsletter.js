// ui-newsletter.js - newsletter signup window (Kit form). Used by ui.js actions
// "open-newsletter" and "confirm-newsletter". Logic and network are in newsletter.js.
(() => {
  "use strict";

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function words(ui) {
    return (ui && ui.wording && ui.wording.newsletter) || {};
  }

  function open(ui) {
    const NL = window.WT_Newsletter;
    if (!ui || !NL || !NL.isConfigured(ui.config)) return;
    const n = words(ui);
    const html = `
      <p>${esc(n.intro)}</p>
      <label class="wt-label" for="wt-nl-email">${esc(n.emailLabel)}</label>
      <input id="wt-nl-email" class="wt-input" type="email" autocomplete="email" inputmode="email" maxlength="254" />
      <label class="wt-label" for="wt-nl-first">${esc(n.firstNameLabel)}</label>
      <input id="wt-nl-first" class="wt-input" type="text" autocomplete="given-name" maxlength="40" />
      <input id="wt-nl-website" type="text" tabindex="-1" autocomplete="off" aria-hidden="true" style="position:absolute;left:-9999px;width:1px;height:1px;opacity:0" />
      <p class="wt-muted">${esc(n.consent)} <a href="./privacy.html" target="_blank" rel="noopener">${esc(n.privacyLink)}</a></p>
      <div class="wt-actions">
        <button class="wt-btn wt-btn--primary" data-action="confirm-newsletter">${esc(n.cta)}</button>
      </div>
      <p id="wt-nl-msg" class="wt-muted" aria-live="polite"></p>
    `;
    ui.openModal(html, String(n.title || ""));
    try {
      const input = ui.modalContentEl && ui.modalContentEl.querySelector("#wt-nl-email");
      if (input && typeof input.focus === "function") input.focus();
    } catch (_) {
      /* focus is a convenience */
    }
  }

  async function submit(ui) {
    const NL = window.WT_Newsletter;
    const root = ui && ui.modalContentEl;
    if (!NL || !root) return;
    const n = words(ui);
    const get = (id) => {
      const el = root.querySelector(id);
      return el ? String(el.value || "") : "";
    };
    const msg = root.querySelector("#wt-nl-msg");
    const button = root.querySelector('[data-action="confirm-newsletter"]');
    const say = (text) => {
      if (msg) msg.textContent = String(text || "");
    };

    if (button) button.disabled = true;
    const result = await NL.submit(ui.config, {
      email: get("#wt-nl-email"),
      firstName: get("#wt-nl-first"),
      website: get("#wt-nl-website")
    });

    if (result === "sent") {
      say(n.thanks);
      root.querySelectorAll('input, [data-action="confirm-newsletter"]').forEach((el) => {
        el.disabled = true;
      });
      try {
        if (window.WT_Analytics && typeof window.WT_Analytics.trackFunnel === "function") {
          window.WT_Analytics.trackFunnel(
            "newsletter_submit",
            typeof window.WT_Analytics.inferUiContext === "function"
              ? window.WT_Analytics.inferUiContext(ui, {})
              : {}
          );
        }
      } catch (_) {
        /* analytics is optional */
      }
      return;
    }
    if (button) button.disabled = false;
    say(result === "invalid" ? n.errorEmail : n.errorNetwork);
  }

  window.WT_UI_Newsletter = { open, submit };
})();
