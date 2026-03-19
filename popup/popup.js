/**
 * CLOKR — Popup UI Script
 * ============================================================
 * Gestisce l'interfaccia del popup dell'estensione.
 *
 * Funzionalità:
 *  - Legge e aggiorna lo stato di abilitazione (toggle)
 *  - Mostra il contatore di elementi protetti oggi
 *  - Visualizza la cronologia degli ultimi 5 elementi mascherati
 *  - Indica quale chatbot AI è rilevato nella tab corrente
 *  - Resetta la cronologia su richiesta
 * ============================================================
 */

"use strict";

// ─── Emoji per tipo PII ────────────────────────────────────
const TYPE_EMOJI = {
  EMAIL:  "📧",
  PHONE:  "📱",
  CF:     "🪪",
  IBAN:   "🏦",
  CARD:   "💳",
  IP:     "🌐",
  DATE:   "📅",
  TS:     "🏥",
  PERSON: "👤"
};

// ─── Riferimenti agli elementi DOM ────────────────────────
const elements = {
  toggle:         document.getElementById("protectionToggle"),
  totalProtected: document.getElementById("totalProtected"),
  activityList:   document.getElementById("activityList"),
  siteBanner:     document.getElementById("siteBanner"),
  siteDot:        document.getElementById("siteDot"),
  siteStatusText: document.getElementById("siteStatusText"),
  clearHistoryBtn: document.getElementById("clearHistoryBtn")
};

// ─── Nomi visualizzati per le piattaforme rilevate ─────────
const SITE_LABELS = {
  "ChatGPT": { label: "ChatGPT detected ✓",  state: "active" },
  "Claude":  { label: "Claude detected (soon)", state: "warning" },
  "Gemini":  { label: "Gemini detected (soon)", state: "warning" }
};

// ─── Utility: timestamp in formato leggibile ──────────────

/**
 * Formatta un timestamp in formato relativo (es. "2 minuti fa").
 * @param {number} timestamp - Unix timestamp in millisecondi
 * @returns {string}
 */
function formatRelativeTime(timestamp) {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (seconds < 60)  return "just now";
  if (minutes < 60)  return `${minutes}m ago`;
  if (hours < 24)    return `${hours}h ago`;
  return new Date(timestamp).toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
}

// ─── Rendering ────────────────────────────────────────────

/**
 * Aggiorna il banner dello stato del sito nella tab corrente.
 * @param {string|null} site - Nome del sito rilevato (es. "ChatGPT") o null
 */
function renderSiteStatus(site) {
  if (!site || !SITE_LABELS[site]) {
    elements.siteDot.className = "site-dot";
    elements.siteStatusText.textContent = "No AI chatbot detected";
    return;
  }

  const { label, state } = SITE_LABELS[site];
  elements.siteDot.className = `site-dot ${state}`;
  elements.siteStatusText.textContent = label;
}

/**
 * Renderizza la lista degli ultimi elementi mascherati nella sessione.
 * Mostra al massimo 5 item. Se la lista è vuota, mostra il messaggio vuoto.
 *
 * @param {Array} history - Array di oggetti { type, preview, placeholder, timestamp }
 */
function renderActivityList(history) {
  const list = elements.activityList;
  list.innerHTML = "";

  if (!history || history.length === 0) {
    list.innerHTML = `
      <li class="activity-empty">
        <span class="empty-icon">🔍</span>
        <span>No items masked yet.<br/>Visit ChatGPT to get started.</span>
      </li>
    `;
    return;
  }

  // Mostra solo gli ultimi 5
  const recent = history.slice(0, 5);

  for (const item of recent) {
    const li = document.createElement("li");
    li.className = "activity-item";

    const emoji  = TYPE_EMOJI[item.type] || "🔒";
    const time   = item.timestamp ? formatRelativeTime(item.timestamp) : "";

    li.innerHTML = `
      <span class="activity-type-badge" title="${item.type}">${emoji}</span>
      <span class="activity-preview">
        <strong>${escapeHTML(item.preview || item.original?.substring(0, 20) || "—")}</strong>
      </span>
      <span class="activity-arrow">→</span>
      <span class="activity-placeholder">${escapeHTML(item.placeholder || "")}</span>
    `;

    if (time) {
      li.title = `Masked ${time}`;
    }

    list.appendChild(li);
  }
}

/**
 * Sfugge i caratteri HTML per prevenire XSS.
 * @param {string} str
 * @returns {string}
 */
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Aggiorna il contatore degli elementi protetti.
 * @param {number} count
 */
function renderCounter(count) {
  elements.totalProtected.textContent = count || 0;
}

/**
 * Applica lo stato visivo del toggle (ON/OFF).
 * @param {boolean} enabled
 */
function applyToggleState(enabled) {
  elements.toggle.checked = !!enabled;
  if (enabled) {
    document.body.classList.remove("protection-off");
  } else {
    document.body.classList.add("protection-off");
  }
}

// ─── Caricamento dati da storage ──────────────────────────

/**
 * Carica tutti i dati da chrome.storage.local e aggiorna la UI.
 */
function loadAndRender() {
  chrome.storage.local.get(
    ["enabled", "totalProtected", "sessionHistory", "detectedSite"],
    (data) => {
      console.log("[CLOKR Popup] Loaded storage:", data);

      // Toggle stato protezione
      applyToggleState(data.enabled !== false);

      // Contatore elementi protetti
      renderCounter(data.totalProtected || 0);

      // Cronologia sessione
      renderActivityList(data.sessionHistory || []);

      // Stato sito rilevato
      renderSiteStatus(data.detectedSite || null);
    }
  );
}

// ─── Gestione tab corrente ─────────────────────────────────

/**
 * Controlla l'URL della tab attiva per determinare il sito AI.
 * Aggiorna anche lo storage con il sito rilevato.
 */
function detectCurrentTab() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || tabs.length === 0) return;

    const url = tabs[0].url || "";
    let detectedSite = null;

    if (url.includes("chat.openai.com") || url.includes("chatgpt.com")) {
      detectedSite = "ChatGPT";
    } else if (url.includes("claude.ai")) {
      detectedSite = "Claude";
    } else if (url.includes("gemini.google.com")) {
      detectedSite = "Gemini";
    }

    renderSiteStatus(detectedSite);

    // Aggiorna storage con il sito rilevato dalla tab corrente
    if (detectedSite) {
      chrome.storage.local.set({ detectedSite });
    }
  });
}

// ─── Event Listeners ──────────────────────────────────────

/**
 * Toggle protezione: salva il nuovo stato su chrome.storage
 */
elements.toggle.addEventListener("change", () => {
  const enabled = elements.toggle.checked;
  chrome.storage.local.set({ enabled }, () => {
    applyToggleState(enabled);
    console.log("[CLOKR Popup] Protection toggled:", enabled);
  });
});

/**
 * Pulsante Clear: cancella la cronologia sessione
 */
elements.clearHistoryBtn.addEventListener("click", () => {
  chrome.storage.local.set({
    sessionHistory: [],
    totalProtected: 0
  }, () => {
    renderActivityList([]);
    renderCounter(0);
    console.log("[CLOKR Popup] History cleared");
  });
});

// ─── Aggiornamenti in tempo reale ─────────────────────────

/**
 * Ascolta i cambiamenti allo storage per aggiornare la UI in tempo reale
 * (es. quando una nuova operazione di masking avviene nella tab corrente)
 */
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  if (changes.totalProtected) {
    renderCounter(changes.totalProtected.newValue || 0);
  }

  if (changes.sessionHistory) {
    renderActivityList(changes.sessionHistory.newValue || []);
  }

  if (changes.enabled) {
    applyToggleState(changes.enabled.newValue);
  }

  if (changes.detectedSite) {
    renderSiteStatus(changes.detectedSite.newValue);
  }
});

// ─── Inizializzazione ─────────────────────────────────────
loadAndRender();
detectCurrentTab();

console.log("[CLOKR Popup] UI initialized ✓");
