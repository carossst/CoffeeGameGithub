/* In-game feedback flourishes: a floating +N, a streak banner, a ball that crosses the card
   (or hits the net), a shake on the lives, and a slide-in for each new question.
   Pure decoration: it reads the DOM that ui.js already renders and never touches scores or timing.
   ui.js (answer handler) calls WT_PlayFx.note() right after validating an answer. */
(() => {
  'use strict';

  const MILESTONES = [3, 5, 8, 12, 20];

  function streakMilestone(streak) {
    return MILESTONES.indexOf(Number(streak)) !== -1;
  }

  const reduced = () =>
    Boolean(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  let pending = null;
  let lastQuestionKey = '';

  function note(info) {
    pending = Object.assign({ at: Date.now() }, info || {});
  }

  const FLAME =
    '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" focusable="false"><path d="M12 2c1 4-3 5-3 9a3 3 0 0 0 6 0c0-1-.5-2-1-3 3 1 5 4 5 7a7 7 0 0 1-14 0c0-6 5-7 7-13z" fill="currentColor"/></svg>';

  function layerFor(card) {
    const layer = document.createElement('div');
    layer.className = 'wt-fx-layer';
    layer.setAttribute('aria-hidden', 'true');
    card.appendChild(layer);
    setTimeout(() => layer.remove(), 1800);
    return layer;
  }

  function el(cls, html) {
    const node = document.createElement('span');
    node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
  }

  function onFeedback(feedback) {
    feedback.setAttribute('data-fx', '1');
    const card = feedback.closest('.wt-card');
    const info = pending && Date.now() - pending.at < 3000 ? pending : null;
    pending = null;
    if (!card || reduced()) return;
    const ok = info ? info.correct === true : feedback.classList.contains('wt-feedback--ok');
    const layer = layerFor(card);

    if (ok) {
      const pill = document.querySelector('.wt-pill__delta--score');
      const delta = pill ? String(pill.textContent || '').trim() : '+1';
      layer.appendChild(el('wt-fx-plus', delta || '+1'));
      layer.appendChild(el('wt-fx-ball wt-fx-ball--ok'));
      const streak = info ? Number(info.streak) : 0;
      if (streakMilestone(streak)) {
        // Compact and language-neutral: the existing micro toast already says it in words.
        layer.appendChild(el('wt-fx-streak', `${FLAME}<b>\u00d7${streak}</b>`));
      }
    } else {
      layer.appendChild(el('wt-fx-ball wt-fx-ball--ko'));
      const lives = document.querySelector('.wt-pill--chances');
      if (lives) {
        lives.classList.remove('wt-fx-shake');
        void lives.offsetWidth;
        lives.classList.add('wt-fx-shake');
      }
    }
  }

  function onQuestion(card) {
    const key = String(card.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!key || key === lastQuestionKey) return;
    lastQuestionKey = key;
    if (reduced()) return;
    card.classList.add('wt-fx-enter');
  }

  function scan() {
    const root = document.getElementById('app') || document.body;
    if (!root || document.querySelector('[data-wt-bonus], [data-wt-bonus-lane]')) return;
    const feedback = root.querySelector('.wt-card[role="status"] .wt-feedback:not([data-fx])');
    if (feedback) return onFeedback(feedback);
    const answer = root.querySelector('[data-action="answer-true"]');
    const card = answer && answer.closest('.wt-card');
    if (card && card.getAttribute('role') !== 'status') onQuestion(card);
  }

  function start() {
    if (!document.body) return;
    new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
    scan();
  }

  window.WT_PlayFx = { note, streakMilestone };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start, { once: true });
  } else {
    start();
  }
})();
