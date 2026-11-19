/* End-of-game flourish: result tier, score count-up and a win sound.
   The markup (pips, tier label) is rendered by ui.js; this module only decides the tier and
   animates what is already there, so a re-render never loses anything. */
(() => {
  "use strict";

  // "perfect" = every answer right, "good" = a solid game, "keep" = room to grow.
  function tier(correct, total, score) {
    const c = Number(correct) || 0;
    const t = Number(total) || 0;
    if (t >= 5 && c === t) return "perfect";
    if ((Number(score) || 0) >= 3 || (t > 0 && c / t >= 0.6)) return "good";
    return "keep";
  }

  // Rapid Fire: a new best of 3+ is a record, 5+ is a solid game, below that no fuss.
  function bonusTier(score, newBest) {
    const s = Number(score) || 0;
    if (newBest === true && s >= 3) return "record";
    return s >= 5 ? "good" : "";
  }

  // Practice (replaying mistakes): only a clean sweep (all mistakes cleared) is celebrated.
  function practiceTier(allCleared) {
    return allCleared === true ? "perfect" : "";
  }

  const reduced = () =>
    Boolean(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  let lastRunAt = 0;

  function countUp(node, target) {
    if (reduced() || target <= 0) return;
    const start = performance.now();
    const duration = 750;
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      node.textContent = String(Math.round(target * eased));
      if (p < 1) requestAnimationFrame(tick);
    };
    node.textContent = "0";
    requestAnimationFrame(tick);
  }

  function enhance() {
    const node = document.querySelector(".wt-end-score__value[data-count]:not([data-fx])");
    if (!node) return;
    node.setAttribute("data-fx", "1");
    const now = Date.now();
    if (now - lastRunAt < 3000) return; // a re-render of the same end screen: no replay
    lastRunAt = now;
    const target = Number(node.getAttribute("data-count")) || 0;
    if (String(node.textContent).trim() === String(target)) countUp(node, target);
    const t = node.getAttribute("data-tier");
    if ((t === "perfect" || t === "good" || t === "record") && window.WT_SFX) window.WT_SFX.play("win");
  }

  function start() {
    if (!document.body) return;
    new MutationObserver(enhance).observe(document.body, { childList: true, subtree: true });
    enhance();
  }

  window.WT_EndFx = { tier, bonusTier, practiceTier, enhance };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();
