// config.js v2.0 - Brew or False
// Configuration + UI copy (single file, no split)

(() => {
  "use strict";

  // 9.1 Environment detection
  const hostname = window.location.hostname;
  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
  const isGitHubPages = hostname.includes("github.io");

  // Single source of truth for storage-related keys (avoid drift)
  const WT_STORAGE_KEY = "coffee_quiz_v1";
  const WT_VANITY_CODE_STORAGE_KEY = "coffee:vanityCode";


  // Global UI helpers (shared across IIFE modules)
  window.WT_UTILS = window.WT_UTILS || {};
  window.WT_UTILS.escapeHtml = function (str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  };

  // Single source of truth for critical enums (no scattered magic strings).
  window.WT_ENUMS = Object.freeze({
    UI_STATES: Object.freeze({
      LANDING: "LANDING",
      PLAYING: "PLAYING",
      END: "END",
      PAYWALL: "PAYWALL"
    }),
    GAME_MODES: Object.freeze({
      RUN: "RUN",
      PRACTICE: "PRACTICE",
      BONUS: "BONUS"
    })
  });

  // 9.2 WT_CONFIG (single source of truth for mechanics)
  window.WT_CONFIG = {

    // Product version (UI display, logs)
    version: "2.1",

    // Storage schema version (localStorage).
    // Change ONLY if you accept a migration/wipe.
    storageSchemaVersion: "2.0.0",

    // Le cache du Service Worker dérive exclusivement de WT_CONFIG.version via ?v=
    // (source unique de vérité pour le cache)

    environment: isLocalhost
      ? "development"
      : (isGitHubPages ? "github-pages" : "production"),

    // Identity
    // URL REGISTRY — also hardcoded in static files:
    // index.html (canonical, og:url, twitter:url)
    // sitemap.xml, robots.txt
    // success.html (contact email domain)
    identity: {
      appName: "Brew or False",
      appUrl: "https://breworfalse.com",
      parentUrl: "",

      // UI signature icon (in-card). Single source of truth for in-app branding.
      uiLogoUrl: "./icons/icon512x512-rond.png"
    },

    // Storage (single source of truth)
    storage: {
      storageKey: WT_STORAGE_KEY,
      vanityCodeStorageKey: WT_VANITY_CODE_STORAGE_KEY
    },

    // Content
    contentUrl: "./content.json",

    // ============================================
    // V2 GAME - continuous RUN (no fixed sessions)
    // ============================================
    game: {
      maxChances: 3,
      poolSize: 200,
      antiRepetitionUntilExhaustion: true
    },

    // ============================================
    // LIMITS - monetization by replayability
    // ============================================
    limits: {
      freeRuns: 2
    },

    // Practice mode (Mistakes only)
    // PRODUCT DECISION (kept):
    // - Returns ALL wrong items (variable length) in mistakesOnly mode
    mistakesOnly: {
      enabled: true,
      minWrongItemsToShowToggle: 1,
      premiumOnly: false,
      freeRunsLimit: 2,
      maxItems: 10
    },

    routing: {
      // If backlog >= this threshold, END (after RUN) promotes PRACTICE as primary CTA.
      // Backlog model: number of items with wrongCount > 0.
      practicePrimaryMinWrong: 9,

      // PRACTICE repeat guidance tiers (based on remaining backlog after PRACTICE).
      // UI picks the FIRST matching tier in the array (top-down).
      // Fail-closed: missing/invalid tiers => no repeat note and no CTA override.
      practiceRepeatTiers: [
        { key: "direct", minRemaining: 7 },
        { key: "firm", minRemaining: 4 },
        { key: "light", minRemaining: 2 },
        { key: "last", minRemaining: 1 }
      ],

      // END RUN verdict thresholds (config-driven).
      // Maps run scoreFP (best score signal for the run) -> verdictKey used by WT_WORDING.end.ctaByVerdict.
      runScoreThresholds: {
        start: 3,
        building: 6,
        strong: 10,
        elite: 15,
        legendary: 20
      },

      // END: show best-streak line only if bestStreakNum >= this threshold.
      bestStreakLineMin: 2
    },

    // Personal best (premium history)
    personalBest: {
      enabled: true,
      premiumOnly: true
    },

    // Premium code flow (TYF-like)
    premiumCodePrefix: "BF",
    premiumCodeRegex: "^BF-[0-9]{4}-[0-9]{4}$",
    acceptCodeOncePerDevice: true,

    // Pricing (Stripe)
    currency: "USD",
    earlyPriceCents: 499,
    standardPriceCents: 699,
    earlyPriceWindowMs: 20 * 60 * 1000, // 20 minutes
    stripeEarlyPaymentUrl: "https://buy.stripe.com/fZu6oJ2Y86pegsjfNt2VG01",
    stripeStandardPaymentUrl: "https://buy.stripe.com/6oUfZj8is00QfofgRx2VG00",
    successRedirectUrl: "./success.html",

    // Marketing (opt-in only; Stripe receipt email is NOT marketing consent)
    marketing: {
      // External signup form URL (Mailchimp / ConvertKit / Buttondown / etc.)
      // Fail-closed in success.html if not set / still placeholder.
      updatesUrl: "",



      // Order bump (Cheat Sheet PDF) - serverless "trust-by-design" via ConvertKit embed.
      // Fail-closed in success.html unless explicitly enabled AND fully configured.
      cheatSheetOrderBump: {
        enabled: true,
        convertKitUid: "ed7df33449",
        convertKitScriptSrc: "https://onlinenewsletter.kit.com/ed7df33449/index.js"
      }
    },



    houseAd: {
      enabled: true,
      premiumOnly: false,
      url: "https://breworfalse.com/",
      showAfterEnd: true,

      // Unlock threshold (unique seen items)
      minUniqueSeenToShow: 100,

      // "Remind later" hide window (mechanics). Storage reads houseAd.hideMs.
      hideMs: 24 * 60 * 60 * 1000, // 24h
    },




    // Micro-pics (mécanique, non visible)
    // microPics garde uniquement les règles propres aux micro-pics.
    // IMPORTANT: streakThresholds est couplé au wording (ex: "3 in a row", "6 in a row", etc.).
    microPics: {
      cooldownItems: 1, // nb d'items minimum entre deux micro-pics

      // Seuils de streak (mécanique). La copy correspondante reste dans WT_WORDING.micropics.*
      streakThresholds: {
        start: 3,
        building: 6,
        strong: 10,
        elite: 15,
        legendary: 20
      },

      // Near-miss (mécanique, non visible) - déclenchement 1 fois par RUN via endHighlight.
      nearMissEnabled: true,

      // Erreurs répétées (mécanique, non visible) - wrongCount >= seuil => endHighlight (1 fois par RUN).
      repeatMistakeWrongCountMin: 2
    },



    // UI namespace → toast component → default variant → params
    // Hiérarchie intentionnelle (lisibilité + évite collisions de clés)

    ui: {
      // Toast / micro-feedback timing buckets
      toast: {
        // Default bucket for gameplay overlays/toasts
        default: {
          delayMs: 0,
          durationMs: 2200
        },

        // Timing bucket for micro-pics / micro-satisfaction
        positive: {
          delayMs: 0,
          durationMs: 1600
        },

        // Timing bucket for "+1" after a correct answer (no fallback in UI)
        scoreGained: {
          delayMs: 0,
          durationMs: 900
        }
      },

      // Gameplay overlay dismiss policy (UI-only, fail-closed)
      // true => allow tap to dismiss gameplay overlays (info/success only)
      toastDismissOnTap: true,



      // Overlays (PLAYING)
      // - chanceLostOverlayMs: -1 chance + "Game over" window
      // - runStartOverlayMs: start-of-run + BONUS rules
      chanceLostOverlayMs: 1800,
      runStartOverlayMs: 3000,


      // Pulses (HUD) + extension window for last-chance overlay
      gameplayPulseMs: 1000,

      // Momentum meter (HUD, UI-only)
      momentumMeter: {
        enabled: true,
        mode: "RUN",
        segments: 6,
        thresholds: {
          s1: 1,
          s2: 2,
          s3: 3,
          s4: 4,
          s5: 5,
          s6: 6
        }
      },

      // END (RUN): "Record moment" window (UI-only).
      // If > 0, END temporarily shows WT_WORDING.end.newBest instead of the scoreLine when newBest=true.
      endRecordMomentMs: 1600,

      // END: delay before opening automatic modals.
      // Goal: let the score and CTA breathe first.
      endAutoModalDelayMs: 1800,

      // PLAYING: toast duration when you beat your best score (RUN/BONUS).
      // No fallback in UI: if missing/invalid => no toast.
      newBestScoreToastMs: 1200,


      // Paywall ticker (UI-only, no silent fallback)
      // Drives the mm:ss countdown + the EARLY->STANDARD visual swap.
      paywallTickerMs: 1000,

      // Paywall urgency (UI-only, no silent fallback)
      // enabled: show the urgency banner during EARLY phase
      // pulseBelowMs: add a stronger pulse when remaining time is low
      paywallUrgency: {
        enabled: true,
        pulseBelowMs: 5 * 60 * 1000 // 5 minutes
      },

      // Explanations display (UI-only, no silent fallback)
      // Goal: make explanationShort easier to scan on mobile (2 lines when possible).
      // splitRegex: first match becomes the line break boundary (used by ui.js)
      explanationDisplay: {
        enabled: true,
        maxLines: 3,
        splitRegex: "\\.\\s+|\\n+" // sentence boundary OR explicit line break
      }
    },

    landingStats: {
      enabled: true,
      paceRunsCount: 4,
      showBeforeFirstRun: false
    },

    // Secret bonus mode
    secretBonus: {
      minDeckSize: 1,
      enabled: true,

      // Teaser premium: free users can start only N bonus runs (lifetime, device-local)
      freeRunsLimit: 2,

      // Entry points (canonical gates)
      // END: show chest after N completed runs (0 = always show on END)
      // LANDING: show chest after N completed runs (0 = always show on LANDING)
      gates: {
        endAfterRuns: 0,
        landingAfterRuns: 1
      },

      // Gesture: single tap (simple, no “secret handshake”)
      tapWindowMs: 900,
      tapsRequired: 0,



      // Gameplay feel
      // Chances derive from WT_CONFIG.game.maxChances for RUN and BONUS.
      // PRACTICE has no chances (revision mode — player reviews all mistakes).
      // Feedback contract (ui.js):
      // - "none" => no feedback screen (auto-advance)
      feedback: "none",

      // Fall animation (BONUS only)
      // ui.js reads secretBonus.fall - single source of truth
      // No fallback: all values mandatory when fall.enabled === true.
      fall: {
        enabled: true,

        // Metadata (calibration contract)
        units: "pctLanePerSec",
        tuningVersion: 2,

        // Speed in % of lane height per second
        initialSpeed: 10,       // très lent au départ
        maxSpeed: 20,           // plafond confortable
        speedIncrement: 0.4,    // rampe étirée (cap ~25 items)

        // Danger zone threshold (0..1 ratio of lane height)
        dangerThreshold: 0.86
      },

      // Visual flash on terms-box after each answer (BONUS only)
      // Fall is frozen during this window, then render + restart.
      feedbackFlashMs: 400,

      // END screen personalization tiers (accuracy = scoreFP / totalPresented)
      // Evaluated top-down: first match wins. Key must match WT_WORDING keys.
      endTiers: [
        { key: "perfect", minAccuracy: 1.0 },
        { key: "high", minAccuracy: 0.75 },
        { key: "medium", minAccuracy: 0.40 },
        { key: "low", minAccuracy: 0 }
      ],

      // Deck-size buckets (seen count). Evaluated top-down: first match wins.
      endDeckTiers: [
        { key: "large", minSeen: 50 },
        { key: "medium", minSeen: 16 },
        { key: "small", minSeen: 0 }
      ],

      // CTA override action when accuracy=low + deck=small (technical routing)
      ctaLowSmallAction: "start-run"





    },


    // Waitlist
    waitlist: {
      enabled: true,

      // Unlock threshold (unique seen items)
      minUniqueSeenToShow: 120,

      // UI routing:
      // - END: can appear when pool is exhausted (first reveal)
      // - LANDING: appears after it has been revealed once (persisted flag)
      placement: "end-and-landing-after-seen-once",

      afterPoolExhaustedOnly: false,
      showModalOneShot: false,

      // Obfuscated email (anti-scraping)
      toEmailObfuscated: "carolestromboni&#64;gmail&#46;com",
      // IMPORTANT: keep this as a pure prefix (UI/email helpers may append details)
      subjectPrefix: "[Brew or False][Waitlist]"

    },

    // Post-completion (pool exhausted): LANDING block + cross-sell
    postCompletion: {
      enabled: true,
      waitlistEnabled: true,
      houseAdEnabled: true,

      // Milestones (% of unique pool coverage)
      // UI must not hardcode 50% / 100%.
      milestoneThresholds: [0.5, 1.0]
    },



    // Anonymous stats sharing (opt-in, no backend)
    statsSharing: {
      enabled: true,
      emailSubject: "[Brew or False][Stats] Anonymous stats",
      maxTopMistakes: 5,
      schemaVersion: "2.0",

      // Product rules:
      // - Do not interrupt gameplay; prompt only on END.
      // - Milestones are based on UNIQUE pool coverage (mots uniques vus), not total exposures.
      // - Multiple chances, but each trigger is shown at most once (storage flags).
      afterPoolExhaustedOnly: false,
      showModalOneShot: false,

      // Milestones (% of unique pool coverage)
      promptThresholdsPct: [30, 50],

      // Extra milestone for intensive players (4th chance)
      powerUserUniqueSeen: 150,
      powerUserRunCompletes: 5,

      // Also prompt when free runs are exhausted (end of the 2 free runs)
      promptOnFreeRunsExhausted: false
    },



    // Support
    support: {
      emailObfuscated: "carolestromboni&#64;gmail&#46;com",
      subjectPrefix: "[Brew or False][Contact]"
    },


    // PWA install prompt
    installPrompt: {
      enabled: true,
      triggerAfterFirstCompletedRun: true
    },

    // Share
    share: {
      enabled: true,

    },

    // Debug
    debug: {
      enabled: isLocalhost,
      logLevel: isLocalhost ? "debug" : "warn"
    },

    // Service Worker / PWA
    serviceWorker: {
      enabled: !isLocalhost,
      autoUpdate: true,
      showUpdateNotifications: true
    }
  };

  // 9.3 UI copy (visible -> WT_WORDING only; no legacy aliases)
  // ------------------------------------------
  // WORD TRAPS — LEXICAL IDENTITY (Momentum)
  // ------------------------------------------
  //
  // Core Intention:
  // Brew or False uses the same momentum-first shell with coffee quiz copy.
  // The tone encourages flow and continuity.
  // It rewards staying engaged and moving forward.
  //
  // Emotional posture:
  // - Steady
  // - Focused
  // - Controlled
  // - In rhythm
  // - Forward-moving
  //
  // Dominant lexical field:
  // - keep going
  // - keep it moving

  // Explicit exclusions:
  // - No aggressive vocabulary (ruthless, destroy, crush, dominate, savage)
  // - No ego inflation (unstoppable, unbeatable, genius)
  // - No cold technical tone (optimize, calibrate, precision-driven language)
  // - Avoid "streak" as the core motivation (allowed only when explicitly contrasting with real improvement).
  //
  // Identity direction:
  // Brew or False keeps the same calm performance-coach posture.
  // Clear. Grounded. Forward.
  // Always about maintaining rhythm and momentum.
  //
  // Validation rule for new copy:
  // If it reinforces flow and continuity -> valid.
  // If it sounds aggressive, ego-heavy, technical, or like "play for streaks" -> reject.
  window.WT_WORDING = {
    brand: {
      creatorLine: "Carole, creator of Brew or False 🇫🇷",
      creatorLineHtml: "An indie game by Studio 2034.<br>Created by <a href=\"https://www.linkedin.com/in/carolestromboni/\" target=\"_blank\" rel=\"noopener\">Carole</a>. 🇫🇷"
    },

    system: {
      close: "Close",
      home: "Home",
      versionPrefix: "",

      loadingTitle: "Loading Brew or False...",
      loadingHint: "Preparing your coffee quiz",
      loadingSlowHint: "Still loading... Check your connection if this takes too long.",
      updateAvailable: "Update available.",
      dismiss: "Dismiss",
      closeIcon: "✕",

      offlinePayment: "Payment requires an internet connection.",
      copied: "Copied",
      copyFailed: "Copy failed",
      downloaded: "Downloaded",
      more: "How to play",
      open: "Open",
      notNow: "Not now",
      continue: "Next",
      tapToContinue: "",

      youChosePrefix: "You chose:",

      playAria: "Play a new game",
      shareAria: "Share the game",
      resultGridAria: "Result grid",
      scoreAria: "Score",
      endActionsAria: "End screen actions",
      shareCardAria: "Share the game",
      premiumUnlockedToast: "Full access unlocked",
      storageSaveFailedToast: "Saving is disabled in this browser mode. Your progress may be lost if you refresh.",
      confirmLeaveRun: "Leave the current game? Your progress will be lost."
    },

    footer: {
      contact: "Contact",
      privacy: "Privacy",
      terms: "Terms",
      press: "Press"
    },

    success: {
      title: "Payment successful",
      subtitle: "Your activation code is ready. Save it, then activate it in the game.",

      codeLabel: "Your activation code",
      clearDataWarning: "If you clear site data or switch device/browser, you will need this code again.",

      howToActivateTitle: "How to activate",
      howToActivateStep1: "Return to the game.",
      howToActivateStep2Prefix: "Tap",
      howToPlayLabel: "How to play",
      activateWithCodeLabel: "Activate with a code",
      howToActivateStep3Prefix: "Paste your code and tap",
      activateLabel: "Activate",

      whatYouGetTitle: "What you get",
      benefitFullAccessPrefix: "Full access to all",
      benefitFullAccessStrongSuffix: " coffee questions",
      benefitFullAccessSuffix: " in this game.",
      benefitUnlimited: "Unlimited play after code activation.",

      ctaBackToGame: "Back to game",
      ctaDownload: "Download code (.txt)",
      shortcutHint: "Shortcut: How to play - Activate with a code.",

      thankYouLine: "Thank you for supporting an independent game 🇫🇷",
      supportLabel: "Need help?",

      copyCta: "Copy code",
      copyAgainCta: "Copy code again",
      tipNoRecover: "Tip: keep this code somewhere safe. It can't be recovered from a server.",
      txtTitle: "Your Brew or False activation code",
      txtSaveLine: "Tip: keep this code somewhere safe.",
      txtNoRecoverLine: "It can't be recovered from a server.",

      cheatSheetTitle: "",
      cheatSheetBody: "",

    },
    landing: {
      title: "Brew or False",
      tagline: "",
      subtitle: "Think you know coffee? Prove it.\n200 true or false questions for coffee fans.",
      microFun: "No signup · Quick games · Free to try",
      microTrust: "Coffee shop drinks, home brewing, beans, and myths.",

      runsLabel: "",
      runsFreeMode: "",

      ctaPlay: "Start the quiz",
      ctaPlayAfterFirstRun: "Play again",
      ctaHow: "How to play",
      // Required for LANDING stat to render
      statsSeenLabel: "Questions seen",

      // Before completion (goal gradient) 
      statsSeenSummaryTemplate: "Seen: {seen}/{poolSize} questions",
      statsPaceSummaryTemplate: "About {runsLeft} more game{pluralS} to see all {poolSize} questions.",
      statsPhaseBadgeDiscovery: "Phase 1/3: Discovery",
      statsPhaseBadgeCorrection: "Phase 2/3: Integrating",
      statsPhaseBadgeConsolidation: "Phase 3/3: Consolidating",

      // After completion (fail-closed: required for the post-200 line)
      statsSeenCompleteLabel: "Coffee quiz progress",
      statsMistakesLabel: "Mistakes",
      statsMistakesSummaryTemplate: "{mistakes}",
      statsMasterySummaryTemplate: "{mastered}/{poolSize} questions answered correctly",

      postPaywallTitle: "Free games completed. Ready for more?",
      postPaywallBody: "Unlock unlimited games anytime and keep your progress on this device.",
      practiceCtaTemplate: "Fix your {count} mistake{pluralS}",
      postPaywallCta: "Unlock full access",

      postPaywallSbTitle: "Before you decide...",
      postPaywallSbBody: "You still have Rapid Fire mode to try. Tap 🎯."
    },
    firstRun: {
      titleRun2: "Quick reminder",
      titleRun3: "Last tip before you play",

      framingLines: [
        "This isn't about streaks.",
        "It's about whether you're actually improving.",
        "Explore 200 coffee questions.",
      ],

      trustLines: [
        "No ads. No tricks.",
        "Think you know coffee? Prove it.",
      ],

      ctaLabel: "Play"
    },

    milestones: {
      halfway: {
        title: "Halfway milestone.",
        bodyLines: [
          "Halfway there: 100/200 questions explored.",
          "You are getting better at separating coffee facts from fiction.",
          "Keep going. This is where it starts to click."
        ],
        cta: "Next"
      }
    },

    ui: {
      chancesLabel: "Lives",
      mistakesLabel: "Mistakes",
      scoreLabel: "Score",
      scoreAriaTemplate: "Score: {score} {fpShort}",
      fpShort: "",
      fpLong: "",
      trueLabel: "True",
      falseLabel: "False",
      gameOverTitle: "Game over",

      // Content loading (LANDING guard)
      contentLoadingToast: "Loading coffee questions...",

      // Pool loop announcement (RUN)
      poolReshuffledToast: "All questions reshuffled. New order.",

      // Pool progress (END micro-line, RUN only)
      seenProgressTemplate: "You saw {seen}/{poolSize} questions.",

      // Start-of-run overlay (economy)
      // Visible uniquement pour FREE et LAST_FREE
      startRunTypeFree: "Your first free game",
      startRunTypeLastFree: "Last free game. Make it count",
      startRunTypeUnlimited: "",
      startRunTypePractice: "Mistakes mode",

      // Start-of-run overlay (education)
      // Ligne unique, lien mental avec le HUD
      startRunChancesOverlay: "Up to {maxChances} mistakes.",

      // Chance state overlays (no \"-1\" text)
      lastChanceOverlay: "One mistake left. Choose carefully.",
      gameOverOverlay: "Game over.",

      // HUD deltas (PLAYING)
      chanceLostDeltaText: "-1",
      mistakeGainedDeltaText: "+1",
      scoreGainedDeltaText: "+1",

      // HUD anchor (PLAYING) — Personal Best (Premium only)
      bestScoreLabel: "Best",
      bestScoreAriaTemplate: "Best: {best}",


    },






    secretBonus: {
      chestAria: "Rapid Fire mode",
      chestHint: "",
      noSeenWordsToast: "Rapid Fire is empty for now. Play a normal game to build your deck.",
      badge: "RAPID FIRE BONUS",

      // END screen (BONUS)
      endTitle: "",
      endDeckSizeLine: "Rapid Fire pool: {count} questions.",
      endDeckSizeLineOne: "Rapid Fire pool: 1 question.",
      endPoolProgressTemplate: "{cleared} out of {shown} correct this round.",
      endDeckExhaustedToast: "All available questions played.",

      // BONUS new best label (END)
      newBest: "NEW BEST SCORE.",

      // END BONUS — cognitive mirror by accuracy tier
      // Contract: arrays MUST contain exactly 2 sentences each. No fallback in UI.
      endByTier: {
        perfect: [
          "Flawless under pressure.",
          "You answered those questions instantly."
        ],
        high: [
          "You stayed in control.",
          "Your coffee instincts were doing the work."
        ],
        medium: [
          "You adjusted quickly.",
          "This mode asks for instinct, not hesitation."
        ],
        low: [
          "The pace got ahead of you.",
          "Here, memory alone is not enough."
        ]
      },

      // END BONUS — personalized recommendation (accuracy × deck size)
      // Keys: "{accuracyTier}_{deckTier}" — must cover all combinations
      endRecoByTier: {
        perfect_small: "Play normal games to grow your Rapid Fire deck.",
        perfect_medium: "Replay to keep that edge.",
        perfect_large: "Your Rapid Fire deck is deep: push further.",

        high_small: "A few more normal games will expand your deck.",
        high_medium: "Try again to lock in the ones you missed.",
        high_large: "Stay in Rapid Fire: you're close to flawless.",

        medium_small: "Build your deck first: play normal games to strengthen your base.",
        medium_medium: "Try another Rapid Fire game to sharpen your reflexes.",
        medium_large: "Keep going. Speed and accuracy will come with repetition.",

        low_small: "Normal games will help build the muscle memory you need here.",
        low_medium: "Take a normal game to rebuild confidence before coming back.",
        low_large: "Try again: speed comes with practice."
      },

      // BONUS END — emotionally congruent CTA label by accuracy tier
      ctaByTier: {
        perfect: "Push your focus further",
        high: "Stay in Rapid Fire",
        medium: "Try Rapid Fire again",
        low: "Try Rapid Fire again"
      },

      // CTA override: when accuracy is low AND deck is small, primary = go to RUN
      ctaLowSmallOverride: "Play a normal game",

      // Start overlay (same component as FREE runs)
      startOverlayLine1: "Rapid Fire mode. Faster pace.",
      startOverlayLine2: "Only questions you've already seen in normal games.",
      startOverlayLine3: "Keep playing normal games to expand your Rapid Fire deck.",

      // Teaser premium (filled by ui.js): {remaining}, {limit}
      startOverlayFreeRunsLimitLine: "",

      // Block modal when free limit reached
      freeLimitReachedTitle: "That was intense.",
      freeLimitReachedBody: "You've used your {limit} free Rapid Fire games.\n\nFull access unlocks unlimited Rapid Fire games. Same speed. No limits.",
      freeLimitReachedCta: "Keep playing",
      freeLimitReachedClose: "Not now",
      startOverlayTapAnywhere: "Tap anywhere to start",

      // Minimal entry (autoporteur)
      title: "Brew or False",
      subtitle: "Rapid Fire Mode",
      questionPrompt: "True or false?",
      dangerLineLabel: "TIMEOUT LINE",
      dangerLineAria: "Timeout line. If the card reaches this line, the item is lost.",
      seenOnlyLine: "{count} questions in your Rapid Fire deck. Only questions you've already seen in regular games.",

      // End toasts (BONUS ends by returning to END screen)
      // Keep existing (even if you later stop using the modal)
      modalTitle: "Rapid Fire Mode",
      modalBody: "You unlocked Rapid Fire mode. It is faster and more demanding, using only questions you've already seen. It tests speed and precision.",
      modalCta: "Play Rapid Fire mode"
    },


    practice: {
      title: "Mistakes mode",
      on: "On",
      off: "Off",

      premiumOnly: "Full access only",
      descLocked: "Replay only the coffee questions that still trip you up.",
      valueLine: "Focus on the questions that still trip you up.",
      descUnlocked: "Only questions you previously got wrong.",

      freeLimitReachedTitle: "End of Free Games.",
      freeLimitReachedBody: "You've used your {limit} free mistakes games.\n\nFull access unlocks unlimited Mistakes mode. Keep fixing your mistakes without limits.",
      freeLimitReachedCta: "Keep playing",
      freeLimitReachedClose: "Not now",

      // END screen (PRACTICE)
      endTitle: "",
      endLine: "Good work. You tightened the weak spots.",
      // Tier-aware override (keyed on practiceRepeatTierKey). Fallback: endLine.
      endLineByTier: {
        last: "Nice recovery.",
        light: "Nice recovery.",
        firm: "Good progress.",
        direct: "You tightened some weak spots."
      },
      endStatsLine: "Mistakes fixed: {fixed}. Mistakes remaining: {remaining}.",

      // Repeat guidance by tier (selected via WT_CONFIG.routing.practiceRepeatTiers)
      // Fail-closed: missing tier key => no note
      endRepeatNoteByTier: {
        last: "One question left. Clear it now.",
        light: "Only a few questions left to clear.",
        firm: "A few questions still need another pass.",
        direct: "Stay in Mistakes mode. These are the questions that need the work."
      },

      scoreLine: "{total} questions reviewed.",

      // PLAYING: calm progress line (replaces assertion in PRACTICE)
      playingProgressLine: "{current}/{total}",

      // Start overlay (PRACTICE): explain the mode (2 lines shown via typeLine + msg)
      startRunChancesOverlayPractice: "Mistakes mode focuses on your active mistakes.\nUp to 10 questions per game.\nFix a question and it leaves the list.\nMake a mistake again, and it comes back.",
      startOverlayTapAnywhere: "Tap anywhere to start",
      // Fallback CTA when no repeat tier is selected
      ctaPracticeAgain: "Practice again",

      // Optional CTA override (END PRACTICE) based on remaining tier
      // Fail-closed: missing tier key => keep ctaPracticeAgain
      ctaRepeatByTier: {
        last: "Clear the last question",
        light: "Fix your mistakes one more time",
        firm: "Play mistakes mode again",
        direct: "Stay in mistakes mode"
      },


      playing: {
        questionLabel: "Question",
        assertion: "Is this statement true or false?",
        answersAria: "Answer choices",
        questionHeadingTemplate: "",
        feedbackTitleOk: "",
        feedbackTitleBad: "",

        // New best score (PLAYING)
        newBestScore: "New best score.",

        // Feedback truth line (used inline after Correct/Incorrect):
        // "Correct - {termEn}"
        // "Incorrect - {termEn}"
        feedbackRelationSameTemplate: "{termEn}",
        feedbackRelationDifferentTemplate: "{termEn}"
      }
    },

    micropics: {
      runContinues: "You got it. Keep going.",


      // Near-miss (END-only highlight)
      nearMiss: "Close call. That one was waiting for you.",


      // Repeated mistakes (END-only highlight)
      repeatMistake: "This one keeps pulling you in. Slow down and read it again.",


      // First time reaching the tier in this game
      streakStart: "3 in a row. You're locked in.",
      streakBuilding: "6 in a row. The pattern is starting to click.",
      streakStrong: "10 in a row. Sharp reading.",
      streakElite: "15 in a row. Very little gets past you now.",
      streakLegendary: "20 in a row. You saw it before it landed.",


      // Reaching a tier again in the same game (after a mistake)
      // {streak} = current streak at display time, {n} = threshold value (3/6/10/15/20)
      streakAgainTemplate: "{streak} in a row again. Back in rhythm.",

      // First non-chiffré micro-pic after a mistake (one-shot)
      recovery: "There you go. Back in rhythm.",

      runEndedAllChancesUsed: ""
    },

    end: {
      title: "",


      // Pool complete (one-shot celebration when 200/200 reached)
      poolCompleteTitle: "Bravo ! All 200 questions complete.",
      poolCompleteLine1: "You made it through the full set. Now you know whether your coffee knowledge really holds up.",
      poolCompleteLine2: "Come back in a few weeks and see what still sticks.",
      poolCompleteScoreLine: "This game: {score} {fpShort}",
      poolCompleteCtaPrimary: "Replay in a new order",
      poolCompleteCtaPractice: "Fix your mistakes",

      freeLimitReachedTitle: "Nice game.",
      freeLimitReachedBody: "You've used your {limit} free games.\n\nFull access unlocks unlimited normal games. Keep training without limits.",
      freeLimitReachedCta: "Keep playing",
      freeLimitReachedClose: "Not now",

      // No redundancy: do not mention chances on END (player already knows).
      endLine: "",


      // (verdict grid removed — identityByVerdict is now the primary END signal)

      // RUN END — identity + lens + CTA by verdict tier
      // Keys must match UI mapping: none/start/building/strong/elite/legendary
      identityByVerdict: {
        none: "A few questions are still catching you.",
        start: "",
        building: "",
        strong: "",
        elite: "",
        legendary: ""
      },

      lensByVerdict: {
        none: "You have {backlog} questions to revisit. Fix your mistakes.",
        start: "Good start. Try to reach 6+ in your next game.",
        building: "{seen}/{poolSize} questions seen. You are getting a better feel for what is true and what is false.",
        strong: "{seen}/{poolSize} questions covered. You're reading these faster now.",
        elite: "{seen}/{poolSize} questions covered. More of this is becoming automatic.",
        legendary: "{seen}/{poolSize} answered correctly. You are reading these with confidence now.",
      },


      ctaByVerdict: {
        none: "Play again",
        start: "Play again: aim for 6+",
        building: "Play again: aim for 10+",
        strong: "Play again: push your score higher",
        elite: "Play again: master the remaining questions",
        legendary: "Play again"
      },

      // Explicit best sequence surfacing (RUN only)
      // Definition: longest sequence of consecutive correct answers within the run
      bestStreakLine: "Best sequence: {bestStreak} correct answers in a row.",

      // RUN progress surfacing (RUN only)
      // Vars: {seen} {poolSize} {remaining}
      progressLine: "Seen: {seen}/{poolSize}. {remaining} left.",

      // Coffee myths identified (RUN only)
      // Definition: distinct items with tag/tags containing "Myths and misconceptions" and correctCount > 0
      // Vars: {count}
      falseFriendsIdentifiedLine: "Topic highlight: {count} correct so far.",


      // END secondary content toggles
      statsToggle: "Stats & games history",

      // Fallback for non-RUN modes (PRACTICE, BONUS)
      effortLine: "Well played.",

      scoreLine: "Score: {score} {fpLong}",

      // Best score surfacing (rendered by ui.js using {best})
      personalBestLine: "Best score: {best} {fpLong}",
      nearBestLine: "{delta} {fpLong} away from your best.",
      // Free runs hint (RUN-only; shown only when remaining > 0)
      freeRunLeft: "{remaining} free game{pluralS} left.",

      // RUN END - mistakes recap (free + premium)
      mistakesTitle: "You missed these questions",
      mistakesNone: "No mistakes.",
      mistakesToggle: "{count} mistakes",

      newBest: "NEW PERSONAL BEST",
      houseAdSummaryLabel: "Keep going with another game",
      playAgain: "Build your knowledge. Play again.",

      practiceCta: "Fix your mistakes",
      practiceCtaTemplate: "Fix your {count} mistake{pluralS}",

      // RUN routing: when score reaches the "strong" tier, END can promote BONUS as primary CTA.
      bonusCtaPrimary: "Enter Rapid Fire Mode",

      // Post-completion routing (pool exhausted + mistakes)
      // Vars: {backlog}
      practiceCtaCountPremium: "Fix your {backlog} remaining mistakes",
      shareTitle: "Share"
    },

    paywall: {
      // Default headline
      headline: "Think you know coffee? Prove it.",

      // LAST FREE RUN - stronger but factual
      headlineLastFree: "You've started separating coffee facts from fiction. Finish the set.",

      // Projection personnalisée (PAYWALL only)
      // Vars: {seen} {poolSize} {remaining}
      progressLine1: "You've already seen {seen} questions. {remaining} more to master.",
      progressLine2: "",

      // Section headers (anti “mur de mots”)
      valueTitle: "Unlock full access",
      trustTitle: "No surprises",

      valueBullets: [
        "200 hand-picked coffee questions with explanations after each answer",
        "Fix your mistakes in a dedicated practice mode",
        "Train your speed in Rapid Fire Mode",
        "Unlimited games, reshuffled every time"
      ],

      // Shared bridge copy (LANDING post-paywall + END runs exhausted)
      bridgeTitle: "Keep building your coffee knowledge.",
      bridgeBody: "Practice your mistakes, train your focus, and master all 200 coffee questions.",

      trustLine: "One-time unlock",
      trustBullets: [
        "Lifetime access, no recurring fees",
        "Works offline after first load",
        "No subscription",
        "No signup needed, ever",
        "Secure payment through Stripe"
      ],


      // PW1: Social proof (optional - do not invent numbers/claims)
      // If all are empty, nothing is rendered.
      socialProofTitle: "What players say",
      socialProofQuotes: [
        { quote: "Fast, clear, and surprisingly useful. I thought I knew coffee, but the explanations kept correcting me.", author: "Maya, home brewer" },
        { quote: "The true or false format makes it easy to keep playing, and the mistakes mode is what made the facts stick.", author: "Jon, cafe regular" }
      ],

      // EARLY-only conversion bump (no fallback; shown only if template is provided)
      // Vars: {saveAmount} {earlyPrice} {standardPrice}
      savingsLineTemplate: "Save {saveAmount} today. Early price.",
      // Micro reassurance under CTA (optional, no fallback)
      checkoutNote: "Secure checkout via Stripe. Takes about 30 seconds.",

      // Primary CTA changes with price phase (EARLY vs STANDARD)
      ctaEarly: "Unlock all 200 questions for $4.99",
      ctaStandard: "Unlock all 200 questions for $6.99",

      // Backward compat (still used in a few places)
      cta: "Get unlimited games",

      alreadyHaveCode: "Already have a code? Activate it here.",
      deviceNote: "Full access stays unlocked on this device. No account needed.",

      // PW2: EARLY visual badge (copy visible)
      earlyBadgeLabel: "Early bird",

      earlyLabel: "Early price",
      standardLabel: "Standard price",

      // Loss-oriented urgency label (stronger conversion driver)
      timerLabel: "Price increases in:",

      postEarlyLine1: "The early price has ended.",
      postEarlyLine2: "{standardPrice}. One-time purchase. Yours forever."
    },


    howto: {
      title: "How to play",
      howToPlayLine1: "You see a statement about coffee.",
      howToPlayLine2: "Decide whether it is true or false.",
      howToPlayLine3: "Choose True or False.",

      modesTitle: "Game modes",
      modesBullets: [
        "Normal Mode: a full game across the question pool. Build your best score.",
        "Rapid Fire Mode: faster and more demanding. Uses only questions you've already seen.",
        "Mistakes Mode: replay your active mistakes (up to 10 questions)."
      ],

      ruleTitle: "Rule",
      ruleSentence: "Each correct answer adds +1 point. A wrong answer adds one mistake.",
      premiumTitle: "Full access",
      alreadyPremium: "Full access is already enabled on this device.",
      activateTitle: "Activate with a code",
      activateLine1: "Already have an activation code? Activate it here.",
      activateLine2: "No account needed. Your code stays on this device.",
      activationCodeLabel: "Activation code",
      activationCodePlaceholder: "BF-0000-0000",
      enterCode: "Enter a code.",
      codeRejected: "Code rejected.",
      activateCta: "Activate",
      codeInvalid: "Invalid code format.",
      codeUsed: "This device already used a code.",
      codeOk: "Full access enabled on this device.",


      autoActivateTitle: "Activation code ready",
      autoActivateLine1: "Your activation code is already saved on this device.",
      autoActivateLine2: "Unlock full access now?",
      autoActivateCta: "Unlock now",
      autoActivateLater: "Not now"
    },

    postCompletion: {
      title: "You've seen everything.",
      body: "Now make it stick. Practice your mistakes, explore Rapid Fire Mode, or replay full games.",

      // Mastered (pool exhausted + 0 active mistakes)
      masteredTitle: "Bravo ! You answered all 200 questions correctly.",
      masteredLine1: "Zero active mistakes. Every question answered correctly.",
      masteredLine2: "Now test your focus under pressure. Then come back in a few weeks and see if it still holds.",
      masteredCtaBonus: "Challenge yourself in Rapid Fire Mode",
      masteredCtaReplay: "Replay in a new order",

      waitlistTitle: "Stay in the loop",
      waitlistBody1: "Get notified when we add new questions or features.",
      waitlistBody2: "No spam. No account. Leave anytime.",
      waitlistCta: "Get notified",
      waitlistDisclaimer: "Email only. Unsubscribe anytime.",
      houseAdCta: "Try Studio 2034"
    },

    houseAd: {
      eyebrow: "After {poolSize} questions",
      title: "You've seen all {poolSize} questions.",
      bodyLine1: "Brew or False is an indie game by Studio 2034.",
      bodyLine2: "We have other games.",
      ctaPrimary: "Try a new game by Studio 2034",
      ctaRemindLater: "Remind later",

      // Landing presence (same meaning, same tone)
      landingTitle: "You've seen all {poolSize} questions.",
      landingBodyLine1: "Brew or False is an indie game by Studio 2034.",
      landingBodyLine2: "We have other games.",
      landingCtaPrimary: "Try Brew or False",
      landingCtaRemindLater: "Remind later"
    },




    waitlist: {
      ctaLabel: "Get notified about future products or features.",
      disclaimer: "No spam. No account. You can leave anytime.",
      title: "Get notified about future products or features.",
      bodyLine1: "No spam. No account. Leave anytime.",
      bodyLine2: "Optional: reply with one idea if you want.",
      inputPlaceholder: "Optional: share an idea.",
      cta: "Send email",

      // Email compose (for inbox filtering + prefill)
      emailSubjectSuffix: "Waitlist",
      emailBodyTemplate: `Hi!

I'd like to join the Brew or False waitlist.

Optional idea:
{idea}

Thanks!`
    },




    share: {
      ctaLabel: "Copy text",
      emailLabel: "Send email",
      emailSubject: "Brew or False",
      previewLabel: "Preview message",
      toastCopied: "Copied.",
      template: `Hey!
I just played a cool coffee game!
{funFact}
Find out 😄
{url}`,

      teaserTrap: "Looks obvious... until it isn't.",
      teaserTrue: "Sometimes the obvious answer is right.",
      funFactTemplatesTrap: [
        `Can you guess? "{termEn}" 🤔`
      ],
      funFactTemplatesTrue: [
        `Can you guess? "{termEn}" 🤔`
      ],


    },



    installPrompt: {
      title: "Install Brew or False",
      body: "Play instantly. Available offline after your first load. No browser tabs. On iPhone: Share > Add to Home Screen.",
      ctaPrimary: "Add to home screen",
      ctaSecondary: "Later"
    },


    statsSharing: {
      sectionTitle: "Anonymous stats (optional)",
      buttonLabel: "Share anonymous stats",

      // Lightweight prompt (shown at milestones)
      promptTitle: "Help improve Brew or False",
      promptBodyTemplate: "You have reached {thresholdPct}% of the pool (unique questions). Share anonymous stats to help improve the game. You can review everything before sending.",
      promptBodyLastFree: "That was your last free game. Share anonymous stats to help improve the game. You can review everything before sending.",
      promptBodyPowerUser: "You're clearly a power player. Share anonymous stats to help improve the game. You can review everything before sending.",
      promptCtaPrimary: "Preview & share",
      promptCtaSecondary: "Not now",

      // Full modal (manual access + prompt primary)
      modalTitle: "Help improve the game",
      modalDescription: "Share your anonymous gameplay stats with the creator. No personal data is collected - you can see exactly what will be sent below.",
      previewLabel: "Data to be shared:",
      ctaSend: "Send via email",
      ctaCancel: "Cancel",
      ctaLater: "Show me later",
      ctaCopy: "Copy to clipboard",
      noStatsToast: "No stats to share yet.",
      successToast: "Email app opened. Send to share your stats.",
      copyToast: "Stats copied to clipboard."
    },



    support: {
      label: "Contact",
      modalTitle: "Write us",
      modalBodyLine1: "Email is the fastest way to reach us.",
      modalBodyLine2: "Copy the address below or open your email app.",
      emailSubjectSuffix: "Feedback",
      ctaCopy: "Copy email",
      ctaOpen: "Open email app",

      // Email compose (prefill)
      emailBodyTemplate: `Hi!

I'm writing about Brew or False.

Message:




Thanks!`
    },


    notFound: {
      title: "Lost in translation?",
      line1: "This page doesn't exist - or it no longer does.",
      line2: "The good news: the game is right where you left it.",
      cta: "Play a new game"
    },

  };



  // 9.6 Soft validation (debug only)
  function validateConfigSoft() {
    const cfg = window.WT_CONFIG;
    if (!cfg || typeof cfg !== "object") return;

    const warn = (...args) => {
      if (cfg.debug && cfg.debug.enabled) console.warn("[WT_CONFIG]", ...args);
    };

    // Regex validity
    try {
      new RegExp(cfg.premiumCodeRegex);
    } catch (e) {
      warn("premiumCodeRegex is invalid", e);
    }

    // UI explanation display regex (optional, but must be valid when enabled)
    try {
      const ed = (cfg.ui && typeof cfg.ui === "object") ? cfg.ui.explanationDisplay : null;
      const enabled = !!(ed && ed.enabled === true);
      const src = enabled ? String(ed.splitRegex || "").trim() : "";
      if (enabled && src) new RegExp(src);
    } catch (e) {
      warn("ui.explanationDisplay.splitRegex is invalid", e);
    }


    // Identity URL (share single source of truth)
    const appUrl = String((cfg.identity && cfg.identity.appUrl) || "").trim();
    if (!appUrl) {
      warn("identity.appUrl is missing (used for share URL)");
    } else if (!/^https?:\/\//i.test(appUrl)) {
      warn("identity.appUrl must start with http:// or https://", appUrl);
    }

    // Stripe URLs
    if (!cfg.stripeEarlyPaymentUrl || String(cfg.stripeEarlyPaymentUrl).includes("REPLACE")) {
      warn("Stripe early URL needs to be configured");
    }
    if (!cfg.stripeStandardPaymentUrl || String(cfg.stripeStandardPaymentUrl).includes("REPLACE")) {
      warn("Stripe standard URL needs to be configured");
    }

    // V2 invariants
    if (!cfg.game || !Number.isFinite(Number(cfg.game.maxChances)) || Number(cfg.game.maxChances) <= 0) {
      warn("game.maxChances must be > 0");
    }

    const poolSizeNum = (cfg.game && Number.isFinite(Number(cfg.game.poolSize))) ? Number(cfg.game.poolSize) : null;
    if (poolSizeNum == null || Math.floor(poolSizeNum) !== poolSizeNum || poolSizeNum < 1 || poolSizeNum > 9999) {
      warn("game.poolSize must be an integer in [1..9999]");
    }

    const freeRunsNum = (cfg.limits && Number.isFinite(Number(cfg.limits.freeRuns))) ? Number(cfg.limits.freeRuns) : null;
    if (freeRunsNum == null || Math.floor(freeRunsNum) !== freeRunsNum || freeRunsNum < 0 || freeRunsNum > 99) {
      warn("limits.freeRuns must be an integer in [0..99]");
    }



    // Micro-pics (mechanics)
    if (!cfg.microPics || typeof cfg.microPics !== "object") {
      warn("microPics is missing (required for in-run micro-pics rules)");
    } else {
      const c = Number(cfg.microPics.cooldownItems);
      if (!Number.isFinite(c) || c < 0 || c > 99) warn("microPics.cooldownItems must be a number in [0..99]");
    }


    // UI namespace → toast component → default variant → params
    // Hiérarchie intentionnelle (lisibilité + évite collisions de clés)

    const uiCfg = (cfg.ui && typeof cfg.ui === "object") ? cfg.ui : null;
    const toastTiming = (uiCfg && typeof uiCfg.toast === "object") ? uiCfg.toast : null;

    if (!toastTiming || typeof toastTiming !== "object") {
      warn("ui.toast is missing (required for UI toast timing)");
    } else {
      // Default bucket is required
      const def = toastTiming.default;
      if (!def || typeof def !== "object") {
        warn("ui.toast.default is missing (required)");
      } else {
        const td = Number(def.delayMs);
        const tdu = Number(def.durationMs);

        if (!Number.isFinite(td) || td < 0 || td > 2000) warn("ui.toast.default.delayMs must be a number in [0..2000]");
        if (!Number.isFinite(tdu) || tdu < 600 || tdu > 4000) warn("ui.toast.default.durationMs must be a number in [600..4000]");
      }

      // Optional buckets: validate only if provided.
      const buckets = ["positive", "scoreGained"];
      buckets.forEach((k) => {
        const b = toastTiming[k];
        if (!b || typeof b !== "object") return;
        const bd = Number(b.delayMs);
        const bdu = Number(b.durationMs);
        if (!Number.isFinite(bd) || bd < 0 || bd > 2000) warn(`ui.toast.${k}.delayMs must be a number in [0..2000]`);
        if (!Number.isFinite(bdu) || bdu < 600 || bdu > 4000) warn(`ui.toast.${k}.durationMs must be a number in [600..4000]`);
      });

    }
    if (!uiCfg) {
      warn("ui is missing (required for UI timing)");
    } else {
      const cl = Number(uiCfg.chanceLostOverlayMs);
      const rs = Number(uiCfg.runStartOverlayMs);
      const pulse = Number(uiCfg.gameplayPulseMs);

      if (!Number.isFinite(cl) || cl < 200 || cl > 3000) warn("ui.chanceLostOverlayMs must be a number in [200..3000]");
      if (!Number.isFinite(rs) || rs < 200 || rs > 3000) warn("ui.runStartOverlayMs must be a number in [200..3000]");
      if (!Number.isFinite(pulse) || pulse < 0 || pulse > 2000) warn("ui.gameplayPulseMs must be a number in [0..2000]");


      // Secret bonus mode (mechanics)
      if (cfg.secretBonus && cfg.secretBonus.enabled === true) {
        const tw = Number(cfg.secretBonus.tapWindowMs);
        const taps = Number(cfg.secretBonus.tapsRequired);

        if (!Number.isFinite(tw) || tw <= 0) warn("secretBonus.enabled true but tapWindowMs is missing/invalid");
        if (!Number.isFinite(taps) || taps < 0) warn("secretBonus.enabled true but tapsRequired is missing/invalid");
        if (!cfg.game || !Number.isFinite(Number(cfg.game.maxChances)) || Number(cfg.game.maxChances) <= 0) {
        }

        // Gates (canonical)
        const gates = cfg.secretBonus.gates;
        if (!gates || typeof gates !== "object") {
          warn("secretBonus.enabled true but secretBonus.gates is missing");
        } else {
          const endAfterRuns = Number(gates.endAfterRuns);
          const landingAfterRuns = Number(gates.landingAfterRuns);

          // KISS: allow 0 (= always show), otherwise require >= 0 integer
          if (!Number.isFinite(endAfterRuns) || endAfterRuns < 0) warn("secretBonus.gates.endAfterRuns missing/invalid (must be >= 0)");
          if (!Number.isFinite(landingAfterRuns) || landingAfterRuns < 0) warn("secretBonus.gates.landingAfterRuns missing/invalid (must be >= 0)");
        }


        const fl = cfg.secretBonus.fall;
        if (!fl || typeof fl !== "object") {
          warn("secretBonus.enabled true but secretBonus.fall is missing");
        } else if (fl.enabled === true) {
          const initialSpeed = Number(fl.initialSpeed);
          const maxSpeed = Number(fl.maxSpeed);
          const speedIncrement = Number(fl.speedIncrement);
          const dangerThreshold = Number(fl.dangerThreshold);

          if (String(fl.units || "").trim() !== "pctLanePerSec") warn("secretBonus.fall.units must be 'pctLanePerSec'");
          const tv = Number(fl.tuningVersion);
          if (!Number.isFinite(tv) || tv < 1) warn("secretBonus.fall.tuningVersion missing/invalid (must be >= 1)");

          if (!Number.isFinite(initialSpeed) || initialSpeed <= 0) warn("secretBonus.fall.initialSpeed missing/invalid");
          if (!Number.isFinite(maxSpeed) || maxSpeed <= 0) warn("secretBonus.fall.maxSpeed missing/invalid");
          if (!Number.isFinite(speedIncrement) || speedIncrement < 0) warn("secretBonus.fall.speedIncrement missing/invalid");
          if (!Number.isFinite(dangerThreshold) || dangerThreshold <= 0 || dangerThreshold >= 1) {
            warn("secretBonus.fall.dangerThreshold missing/invalid (must be in (0..1))");
          }
          if (Number.isFinite(initialSpeed) && Number.isFinite(maxSpeed) && maxSpeed < initialSpeed) {
            warn("secretBonus.fall.maxSpeed must be >= initialSpeed");
          }
        }

      }



      // Waitlist email (obfuscated)
      if (cfg.waitlist && cfg.waitlist.enabled && !cfg.waitlist.toEmailObfuscated) {
        warn("waitlist.enabled true but toEmailObfuscated missing");
      }

      // Support email (obfuscated)
      if (cfg.support && !cfg.support.emailObfuscated) {
        warn("support.emailObfuscated missing");
      }
    }
  }

  // Run on load
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      validateConfigSoft();
    });
  } else {
    validateConfigSoft();
  }


})();
