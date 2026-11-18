/* Answer sounds and vibration. Sound is off by default (many players are in a café, a
   train or an office) and is switched on with the visible button. Vibration is short,
   Android only, and skipped when the user asks for reduced motion.
   Sounds are synthesised with the Web Audio API: no audio files to load. */
(() => {
  "use strict";

  const KEY = "wt-sfx";
  let ctx = null;
  let enabled = false;

  function readPref() {
    try {
      return window.localStorage.getItem(KEY) === "on";
    } catch (_) {
      return false;
    }
  }

  function writePref(on) {
    try {
      window.localStorage.setItem(KEY, on ? "on" : "off");
    } catch (_) {
      /* private mode: the choice just lasts for this visit */
    }
  }

  function audio() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC();
    } catch (_) {
      ctx = null;
    }
    return ctx;
  }

  // One short note: frequency glide, quick decay.
  function note(c, type, from, to, start, length, volume) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    const t0 = c.currentTime + start;
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    osc.frequency.exponentialRampToValueAtTime(to, t0 + length);
    gain.gain.setValueAtTime(volume, t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + length);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + length + 0.02);
  }

  function sound(kind) {
    const c = audio();
    if (!c) return;
    if (c.state === "suspended" && typeof c.resume === "function") c.resume();
    if (kind === "correct") {
      // spoon on a cup: a short, bright "clink"
      note(c, "sine", 1320, 1330, 0, 0.12, 0.2);
      note(c, "sine", 1980, 1990, 0.02, 0.09, 0.08);
    } else if (kind === "win") {
      // short rising arpeggio
      [523, 659, 784, 1047].forEach((f, i) => note(c, "triangle", f, f * 1.01, i * 0.09, 0.16, 0.2));
    } else {
      // dull thud, like a mug set down too hard
      note(c, "sine", 170, 70, 0, 0.18, 0.3);
    }
  }

  function vibrate(kind) {
    try {
      if (typeof window.navigator.vibrate !== "function") return;
      if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      window.navigator.vibrate(
        kind === "correct" ? 15 : kind === "win" ? [30, 40, 30, 40, 60] : [35, 40, 35]
      );
    } catch (_) {
      /* not supported */
    }
  }

  // kind: "correct", "wrong" or "win"
  function play(kind) {
    const k = kind === "correct" || kind === "win" ? kind : "wrong";
    vibrate(k);
    if (enabled) sound(k);
  }

  function isEnabled() {
    return enabled;
  }

  function setEnabled(on) {
    enabled = Boolean(on);
    writePref(enabled);
    if (enabled) audio(); // created inside the click that switched sound on
    syncButton();
  }

  let button = null;

  function labels() {
    const w = (window.WT_WORDING && window.WT_WORDING.system) || {};
    return {
      on: String(w.sfxOn || "Sound effects on"),
      off: String(w.sfxOff || "Sound effects off")
    };
  }

  function syncButton() {
    if (!button) return;
    const l = labels();
    const text = enabled ? l.on : l.off;
    button.setAttribute("aria-pressed", enabled ? "true" : "false");
    button.setAttribute("data-state", enabled ? "on" : "off");
    button.setAttribute("aria-label", text);
    button.setAttribute("title", text);
  }

  function mountButton() {
    if (!document.body || document.getElementById("wt-sfx-toggle")) return;
    button = document.createElement("button");
    button.type = "button";
    button.id = "wt-sfx-toggle";
    button.className = "wt-sfx-toggle";
    // A music note, not a speaker: the speaker on the question card reads the question aloud.
    button.innerHTML =
      '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">' +
      '<path d="M9 17V5l10-2v12" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>' +
      '<circle cx="6.5" cy="17.5" r="2.8" fill="currentColor"/><circle cx="16.5" cy="15.5" r="2.8" fill="currentColor"/>' +
      '<path class="wt-sfx-mute" d="M3 3l18 18" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/>' +
      "</svg>";
    button.addEventListener("click", () => {
      setEnabled(!enabled);
      if (enabled) sound("correct"); // confirms that sound is on
    });
    document.body.appendChild(button);
    syncButton();
  }

  enabled = readPref();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountButton, { once: true });
  } else {
    mountButton();
  }

  window.WT_SFX = { play, isEnabled, setEnabled };
})();
