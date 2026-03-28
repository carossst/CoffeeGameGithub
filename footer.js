// footer.js — shared footer injection (uses email.js)
// Responsibility: inject footer markup into #wt-footer-root when needed.
// Branding, version, labels and parent link are hydrated here. Contact is handled by email.js.
(() => {
    "use strict";

    function hasNonEmptyContent(el) {
        if (!el) return false;
        const txt = String(el.textContent || "").replace(/\s+/g, " ").trim();
        return txt.length > 0 || el.children.length > 0;
    }

    function injectIntoFooterRoot(root) {
        if (!root) return;

        // Upgrade-safe guard:
        // - If footer already exists BUT is missing the Press link, we re-inject.
        // - If Press exists, we keep current DOM (do not overwrite).
        if (hasNonEmptyContent(root)) {
            const hasPress = !!(root.querySelector && root.querySelector("#wt-press-link"));
            if (hasPress) return;
        }

        root.innerHTML = `
      <div class="wt-container">
        <div class="wt-footer-inner">
          <!-- Ligne 1 : Branding -->
          <div class="wt-footer-row wt-footer-row--brand">
            <span class="wt-footer-creator" data-wt-brand="creatorLine"></span>
          </div>

          <!-- Ligne 2 : Liens utilitaires -->
          <div class="wt-footer-row wt-footer-row--links">
            <a id="wt-contact-link" class="wt-footer-link" href="#" data-wt-wording="footer.contact"></a>
            <span class="wt-footer-sep" aria-hidden="true">·</span>
            <a id="wt-tyf-link" class="wt-footer-link" href="#" target="_blank" rel="noopener"></a>
            <span class="wt-footer-sep wt-footer-sep--tyf" aria-hidden="true">·</span>
            <a id="wt-privacy-link" class="wt-footer-link" href="./privacy.html" target="_blank" rel="noopener"
              data-wt-wording="footer.privacy"></a>
            <span class="wt-footer-sep" aria-hidden="true">·</span>
            <a id="wt-terms-link" class="wt-footer-link" href="./terms.html" target="_blank" rel="noopener"
              data-wt-wording="footer.terms"></a>
            <span class="wt-footer-sep" aria-hidden="true">·</span>
            <a id="wt-press-link" class="wt-footer-link" href="./press.html" target="_blank" rel="noopener"
              data-wt-wording="footer.press"></a>
            <span class="wt-footer-sep" aria-hidden="true">·</span>
            <span class="wt-footer-version" data-wt-version></span>
          </div>
        </div>
      </div>
    `;
    }

    function hydrateFooter(root) {
        if (!root) return;

        const cfg = window.WT_CONFIG;
        const w = window.WT_WORDING;
        if (!cfg || typeof cfg !== "object" || !w || typeof w !== "object") return;

        // Apply wording (scoped to footer only)
        try {
            const nodes = root.querySelectorAll("[data-wt-wording]"); nodes.forEach((el) => {
                const key = String(el.getAttribute("data-wt-wording") || "").trim();
                if (!key) return;

                const parts = key.split(".");
                let cur = w;
                for (const p of parts) {
                    if (!cur || typeof cur !== "object") { cur = null; break; }
                    cur = cur[p];
                }

                const txt = String(cur || "").trim();
                el.textContent = txt || "";
            });
        } catch (_) { /* silent */ }

        // Creator line (prefer HTML if provided)
        try {
            const creatorEl = root.querySelector('[data-wt-brand="creatorLine"]');
            if (creatorEl) {
                const html = String(w.brand?.creatorLineHtml || "").trim();
                const line = String(w.brand?.creatorLine || "").trim();
                if (html) creatorEl.innerHTML = html;
                else creatorEl.textContent = line || "";
            }
        } catch (_) { /* silent */ }

        // Parent app/site link (optional segment)
        try {
            const appUrlEl = root.querySelector("#wt-tyf-link");
            const appUrlSep = root.querySelector(".wt-footer-sep--tyf");
            const url = String(cfg.identity?.parentUrl || "").trim();

            if (appUrlEl) {
                if (url) {
                    appUrlEl.setAttribute("href", url);
                    appUrlEl.setAttribute("target", "_blank");
                    appUrlEl.setAttribute("rel", "noopener");

                    try {
                        appUrlEl.textContent = new URL(url).hostname.replace(/^www\./, "");
                    } catch (_) {
                        appUrlEl.textContent = url;
                    }

                    appUrlEl.style.display = "";
                    if (appUrlSep) appUrlSep.style.display = "";
                } else {
                    appUrlEl.style.display = "none";
                    if (appUrlSep) appUrlSep.style.display = "none";
                }
            }
        } catch (_) { /* silent */ }

        // Version
        try {
            const vEl = root.querySelector("[data-wt-version]");
            if (vEl) {
                vEl.textContent = "";
            }
        } catch (_) { /* silent */ }
    }

    function tryInject() {
        const root = document.getElementById("wt-footer-root");
        if (!root) return;

        injectIntoFooterRoot(root);
        hydrateFooter(root);

        // Let email.js wire the contact link, but enforce FAIL-CLOSED here:
        // - If Contact text looks like an email (contains "@"), remove it (anti-leak).
        if (window.WT_Email && typeof window.WT_Email.initEmailLinks === "function") {
            window.WT_Email.initEmailLinks();
        }

        const contact = document.getElementById("wt-contact-link");
        if (contact) {
            const isIndex = !!document.getElementById("app");
            const txt = String(contact.textContent || "").trim();
            const looksLikeEmail = txt.includes("@");

            // Fail-closed rules:
            // - Never show raw email as visible text.
            // - On secondary pages: remove Contact.
            // - On app page: keep Contact if wording exists; email.js will wire behavior.
            const shouldRemove =
                looksLikeEmail ||
                (!txt) ||
                (!isIndex);

            if (shouldRemove) {
                const sep = contact.nextElementSibling; contact.remove();
                if (sep && sep.classList && sep.classList.contains("wt-footer-sep")) {
                    sep.remove();
                }
            }
        }
    }

    tryInject();

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", tryInject);
    }
})();