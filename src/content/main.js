/**
 * CLOKR — Content Script Router
 * ============================================================
 * Router principale dei content scripts.
 * Determina su quale piattaforma AI siamo e carica l'adapter
 * corrispondente.
 *
 * Piattaforme supportate:
 *   ✅ ChatGPT     → chat.openai.com / chatgpt.com
 *   🔜 Claude      → claude.ai              (in sviluppo)
 *   🔜 Gemini      → gemini.google.com       (in sviluppo)
 * ============================================================
 */

(function () {
  "use strict";

  // Verifica che il namespace CLOKR sia disponibile
  if (typeof window.CLOKR === "undefined") {
    console.error("[CLOKR] CRITICAL: CLOKR namespace not found. Extension may not function correctly.");
    return;
  }

  const hostname = window.location.hostname;
  console.log("[CLOKR] Router loaded on:", hostname);

  /**
   * Verifica se siamo su ChatGPT (chat.openai.com o chatgpt.com)
   */
  function isChatGPT() {
    return hostname === "chat.openai.com" ||
           hostname === "chatgpt.com" ||
           hostname.endsWith(".chatgpt.com") ||
           hostname.endsWith(".openai.com");
  }

  /**
   * Verifica se siamo su Claude.ai
   */
  function isClaude() {
    return hostname === "claude.ai" ||
           hostname.endsWith(".claude.ai");
  }

  /**
   * Verifica se siamo su Google Gemini
   */
  function isGemini() {
    return hostname === "gemini.google.com" ||
           hostname.endsWith("gemini.google.com");
  }

  /**
   * Placeholder per l'adapter di Claude (da implementare in v1.1)
   */
  function initClaudeAdapter() {
    console.log("[CLOKR] Claude adapter — coming soon in v1.1");
    // TODO: Implementare l'adapter per Claude
    // Claude usa un editor Lexical con un approccio simile a ChatGPT
    // Il selettore principale è: div[contenteditable='true'].ProseMirror
    showComingSoonBadge("Claude");
  }

  /**
   * Placeholder per l'adapter di Gemini (da implementare in v1.1)
   */
  function initGeminiAdapter() {
    console.log("[CLOKR] Gemini adapter — coming soon in v1.1");
    // TODO: Implementare l'adapter per Gemini
    // Gemini usa un rich-text editor basato su div contenteditable
    // Il selettore principale è: rich-textarea div[contenteditable='true']
    showComingSoonBadge("Gemini");
  }

  /**
   * Mostra un badge "coming soon" per le piattaforme non ancora supportate.
   * @param {string} siteName - Nome della piattaforma
   */
  function showComingSoonBadge(siteName) {
    const badge = document.createElement("div");
    badge.id = "clokr-coming-soon";
    badge.innerHTML = `🛡️ CLOKR — ${siteName} support coming soon`;

    Object.assign(badge.style, {
      position:     "fixed",
      bottom:       "20px",
      right:        "20px",
      zIndex:       "99999",
      padding:      "8px 14px",
      background:   "rgba(9,9,11,0.9)",
      border:       "1px solid #22D3EE",
      borderRadius: "8px",
      color:        "#22D3EE",
      fontFamily:   "-apple-system, sans-serif",
      fontSize:     "12px",
      opacity:      "0.8"
    });

    // Auto-rimuovi dopo 5 secondi
    setTimeout(() => {
      if (badge.parentNode) badge.remove();
    }, 5000);

    document.body && document.body.appendChild(badge);
  }

  // ─── Routing ──────────────────────────────────────────────

  /**
   * Esegue il routing verso l'adapter corretto in base all'hostname.
   * Attende che il DOM sia pronto prima di inizializzare.
   */
  function route() {
    if (isChatGPT()) {
      console.log("[CLOKR] ✓ ChatGPT detected — loading adapter");

      if (typeof window.CLOKR.initChatGPTAdapter === "function") {
        window.CLOKR.initChatGPTAdapter();
      } else {
        console.error("[CLOKR] ChatGPT adapter not found. Check script loading order.");
      }

    } else if (isClaude()) {
      console.log("[CLOKR] Claude detected — adapter coming soon");
      initClaudeAdapter();

    } else if (isGemini()) {
      console.log("[CLOKR] Gemini detected — adapter coming soon");
      initGeminiAdapter();

    } else {
      console.log("[CLOKR] Unknown site:", hostname, "— no adapter loaded");
    }
  }

  // Avvia il router quando il DOM è pronto
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", route);
  } else {
    // DOM già pronto (caso common con run_at: document_idle)
    route();
  }

})();
