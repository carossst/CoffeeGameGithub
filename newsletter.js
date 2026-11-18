/* Newsletter signup through a Kit (ConvertKit) form. Nothing is sent anywhere
   and nothing is shown until the owner pastes the form action URL into
   WT_CONFIG.newsletter.formAction.en (fail-closed).
   The browser posts the same fields as Kit's own embed form; the answer of a
   cross-origin form post cannot be read, so the UI says "check your inbox"
   (Kit sends the confirmation email: double opt-in must be set in Kit). */
(() => {
  "use strict";

  const KEY = "wt-newsletter";
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function cfgOf(config) {
    return (config && config.newsletter) || {};
  }

  function formAction(config) {
    const url = String((cfgOf(config).formAction || {}).en || "").trim();
    return /^https:\/\/app\.kit\.com\/forms\/\d+\/subscriptions$/.test(url) ? url : "";
  }

  function isConfigured(config) {
    return formAction(config) !== "";
  }

  // "sent" or "" (never subscribed on this device)
  function state() {
    try {
      return window.localStorage.getItem(KEY) || "";
    } catch (_) {
      return "";
    }
  }

  function remember(value) {
    try {
      window.localStorage.setItem(KEY, value);
    } catch (_) {
      /* private mode: the card may show again, which is harmless */
    }
  }

  // Card shown on the end and landing screens: configured, and not already subscribed.
  function shouldOffer(config) {
    return isConfigured(config) && state() !== "sent";
  }

  function validate(input) {
    const email = String((input && input.email) || "").trim();
    const firstName = String((input && input.firstName) || "").trim().slice(0, 40);
    if (email.length > 254 || !EMAIL_RE.test(email)) return { ok: false, reason: "EMAIL" };
    return { ok: true, email, firstName };
  }

  // Posts the form. Resolves "sent" (answer unreadable by design), "invalid",
  // "off" (not configured) or "unavailable" (network error).
  async function submit(config, input) {
    const action = formAction(config);
    if (!action) return "off";
    const v = validate(input);
    if (!v.ok) return "invalid";
    if (input && input.website) return "sent"; // honeypot: a bot filled the hidden field
    const names = Object.assign(
      { email: "email_address", firstName: "fields[first_name]" },
      cfgOf(config).fieldNames || {}
    );
    const body = new URLSearchParams();
    body.set(names.email, v.email);
    if (v.firstName) body.set(names.firstName, v.firstName);
    try {
      await fetch(action, { method: "POST", mode: "no-cors", body });
    } catch (_) {
      return "unavailable";
    }
    remember("sent");
    return "sent";
  }

  window.WT_Newsletter = { formAction, isConfigured, state, remember, shouldOffer, validate, submit, KEY };
})();
