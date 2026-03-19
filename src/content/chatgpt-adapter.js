/**
 * CLOKR — ChatGPT Adapter
 * ============================================================
 * Content script per ChatGPT (chat.openai.com e chatgpt.com).
 *
 * Funzionamento:
 *  1. Usa MutationObserver per rilevare quando il campo di input
 *     di ChatGPT è disponibile nel DOM (gestito da React).
 *  2. Intercetta l'invio del messaggio (Enter o click su Send).
 *  3. Legge il testo, esegue la rilevazione PII, maschera i dati.
 *  4. Sostituisce il testo nel campo input con quello mascherato.
 *  5. Mostra un toast/badge "X elementi protetti".
 *  6. Opzionale: de-maschera le risposte dell'AI (per mostrare
 *     all'utente i valori originali nel contesto della risposta).
 *
 * NOTA: ChatGPT usa un <div contenteditable> gestito da React.
 * La modifica diretta del DOM non è sufficiente — dobbiamo usare
 * gli eventi nativi per notificare React della modifica.
 * ============================================================
 */

// Guard: evita di eseguire se il namespace non è pronto
if (typeof window.CLOKR === "undefined") {
  console.error("[CLOKR] ERROR: CLOKR namespace not found. Make sure pii-detector.js and masker.js are loaded first.");
}

// ─── Configurazione Adapter ───────────────────────────────

/**
 * Selettori CSS per trovare gli elementi di ChatGPT nel DOM.
 * ChatGPT cambia spesso la struttura del DOM — usiamo più selettori
 * come fallback per maggiore robustezza.
 */
const CHATGPT_SELECTORS = {
  // Il campo di input principale (div contenteditable)
  inputField: [
    "#prompt-textarea",
    "div[contenteditable='true'][data-id]",
    "div[contenteditable='true'].ProseMirror",
    "textarea[data-id='root']",
    "div[contenteditable='true']"
  ],
  // Il pulsante di invio
  sendButton: [
    "button[data-testid='send-button']",
    "button[aria-label='Send message']",
    "button[aria-label='Invia il messaggio']",
    "form button[type='submit']",
    "button.absolute.bottom-0"
  ],
  // I messaggi nella conversazione
  messageContainer: [
    "[data-message-author-role]",
    ".message",
    "[class*='ConversationItem']"
  ],
  // Il form di invio
  form: [
    "form[class*='stretch']",
    "form",
  ]
};

// ─── Stato locale dell'adapter ────────────────────────────

/** Tiene traccia degli elementi già monitorati per evitare duplicati */
let watchedInput = null;
let watchedForm = null;
let isProtectionActive = true;
let toastTimeout = null;

// Legge lo stato di attivazione da chrome.storage
chrome.storage.local.get("enabled", (data) => {
  isProtectionActive = data.enabled !== false; // Default: attivo
  console.log("[CLOKR] Protection active:", isProtectionActive);
});

// Ascolta cambiamenti allo stato di abilitazione dal popup
chrome.storage.onChanged.addListener((changes) => {
  if (changes.enabled) {
    isProtectionActive = changes.enabled.newValue;
    console.log("[CLOKR] Protection toggled:", isProtectionActive);
    updateShieldBadge();
  }
});

// ─── Utility DOM ──────────────────────────────────────────

/**
 * Trova il primo elemento corrispondente tra una lista di selettori CSS.
 * @param {string[]} selectors - Array di selettori CSS da provare in ordine
 * @param {Element}  context   - Elemento radice per la ricerca (default: document)
 * @returns {Element|null}
 */
function findElement(selectors, context = document) {
  for (const selector of selectors) {
    try {
      const el = context.querySelector(selector);
      if (el) return el;
    } catch (e) {
      // Selettore non valido, continua con il prossimo
    }
  }
  return null;
}

/**
 * Legge il testo dal campo input di ChatGPT.
 * Gestisce sia <textarea> che <div contenteditable>.
 * @param {Element} inputEl - Il campo di input
 * @returns {string}
 */
function getInputText(inputEl) {
  if (!inputEl) return "";
  if (inputEl.tagName === "TEXTAREA") {
    return inputEl.value || "";
  }
  // Per i div contenteditable, usa innerText per preservare le newline
  return inputEl.innerText || inputEl.textContent || "";
}

/**
 * Imposta il testo nel campo input di ChatGPT in modo compatibile con React.
 * React usa un synthetic event system — la modifica diretta di .value o .innerText
 * non triggera il re-render. Dobbiamo simulare un evento nativo.
 *
 * @param {Element} inputEl   - Il campo di input
 * @param {string}  newText   - Il testo da impostare
 */
function setInputText(inputEl, newText) {
  if (!inputEl) return;

  try {
    if (inputEl.tagName === "TEXTAREA") {
      // Per textarea: usa il setter nativo di React
      const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, "value"
      )?.set;

      if (nativeInputValueSetter) {
        nativeInputValueSetter.call(inputEl, newText);
      } else {
        inputEl.value = newText;
      }

      // Dispatcha eventi per notificare React
      inputEl.dispatchEvent(new Event("input", { bubbles: true }));
      inputEl.dispatchEvent(new Event("change", { bubbles: true }));

    } else {
      // Per div contenteditable: seleziona tutto e sostituisci
      inputEl.focus();

      // Seleziona tutto il testo esistente
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(inputEl);
      selection.removeAllRanges();
      selection.addRange(range);

      // Usa execCommand per compatibilità (deprecato ma ancora funzionante)
      document.execCommand("insertText", false, newText);

      // Fallback: modifica diretta + eventi
      if (getInputText(inputEl).trim() !== newText.trim()) {
        inputEl.innerText = newText;
        inputEl.dispatchEvent(new InputEvent("input", {
          bubbles: true,
          cancelable: true,
          inputType: "insertText",
          data: newText
        }));
      }
    }

    console.log("[CLOKR] Input text updated successfully");
  } catch (err) {
    console.error("[CLOKR] Failed to update input text:", err);
  }
}

// ─── Toast / Badge UI ─────────────────────────────────────

/**
 * Mostra un toast temporaneo nell'angolo dello schermo
 * quando dei dati PII vengono mascherati.
 *
 * @param {number} count - Numero di elementi PII mascherati
 * @param {Array}  items - Lista di item mascherati per il dettaglio
 */
function showProtectionToast(count, items) {
  // Rimuovi toast precedente se presente
  const existing = document.getElementById("clokr-toast");
  if (existing) existing.remove();
  if (toastTimeout) clearTimeout(toastTimeout);

  // Crea il toast
  const toast = document.createElement("div");
  toast.id = "clokr-toast";
  toast.setAttribute("role", "status");
  toast.setAttribute("aria-live", "polite");

  // Contenuto del toast
  const types = items.map(i => i.type).join(", ");
  toast.innerHTML = `
    <div class="clokr-toast-icon">🛡️</div>
    <div class="clokr-toast-text">
      <strong>${count} item${count !== 1 ? "s" : ""} protected</strong>
      <span class="clokr-toast-types">${types}</span>
    </div>
  `;

  // Stili inline per il toast (non dipende da foglio di stile esterno)
  Object.assign(toast.style, {
    position:       "fixed",
    bottom:         "100px",
    right:          "20px",
    zIndex:         "999999",
    display:        "flex",
    alignItems:     "center",
    gap:            "10px",
    padding:        "12px 18px",
    background:     "linear-gradient(135deg, #09090B 0%, #18181b 100%)",
    border:         "1px solid #4ADE80",
    borderRadius:   "12px",
    boxShadow:      "0 8px 32px rgba(0,0,0,0.4), 0 0 0 1px rgba(74,222,128,0.2)",
    color:          "#F4F4F5",
    fontFamily:     "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
    fontSize:       "13px",
    lineHeight:     "1.4",
    maxWidth:       "300px",
    animation:      "clokr-slide-in 0.3s ease-out",
    cursor:         "pointer"
  });

  // Stili per le parti interne
  const style = document.createElement("style");
  style.textContent = `
    @keyframes clokr-slide-in {
      from { transform: translateX(120%); opacity: 0; }
      to   { transform: translateX(0);   opacity: 1; }
    }
    @keyframes clokr-slide-out {
      from { transform: translateX(0);   opacity: 1; }
      to   { transform: translateX(120%); opacity: 0; }
    }
    #clokr-toast .clokr-toast-icon { font-size: 20px; flex-shrink: 0; }
    #clokr-toast strong { display: block; color: #4ADE80; font-weight: 600; }
    #clokr-toast .clokr-toast-types { font-size: 11px; color: #71717a; }
  `;

  if (!document.getElementById("clokr-styles")) {
    style.id = "clokr-styles";
    document.head.appendChild(style);
  }

  document.body.appendChild(toast);

  // Rimuovi il toast dopo 4 secondi
  toastTimeout = setTimeout(() => {
    toast.style.animation = "clokr-slide-out 0.3s ease-in forwards";
    setTimeout(() => toast.remove(), 300);
  }, 4000);

  // Click per chiudere manualmente
  toast.addEventListener("click", () => {
    clearTimeout(toastTimeout);
    toast.style.animation = "clokr-slide-out 0.3s ease-in forwards";
    setTimeout(() => toast.remove(), 300);
  });
}

/**
 * Mostra/aggiorna il badge CLOKR nell'interfaccia ChatGPT
 * per indicare lo stato della protezione.
 */
function updateShieldBadge() {
  let badge = document.getElementById("clokr-shield-badge");

  if (!badge) {
    badge = document.createElement("div");
    badge.id = "clokr-shield-badge";
    Object.assign(badge.style, {
      position:     "fixed",
      bottom:       "20px",
      right:        "20px",
      zIndex:       "99999",
      width:        "36px",
      height:       "36px",
      borderRadius: "50%",
      display:      "flex",
      alignItems:   "center",
      justifyContent: "center",
      fontSize:     "16px",
      cursor:       "pointer",
      transition:   "all 0.2s ease",
      boxShadow:    "0 2px 12px rgba(0,0,0,0.3)"
    });
    badge.title = "CLOKR — AI Privacy Shield";
    document.body.appendChild(badge);
  }

  if (isProtectionActive) {
    badge.textContent = "🛡️";
    badge.style.background = "rgba(74, 222, 128, 0.15)";
    badge.style.border = "1.5px solid #4ADE80";
  } else {
    badge.textContent = "⚠️";
    badge.style.background = "rgba(239, 68, 68, 0.15)";
    badge.style.border = "1.5px solid #EF4444";
  }
}

// ─── Logica di intercettazione ────────────────────────────

/**
 * Processa il testo del campo input prima dell'invio.
 * Esegue PII detection, maschera i dati, aggiorna il campo.
 *
 * @param {Element} inputEl - Il campo di input da processare
 * @returns {boolean} true se sono stati mascherati dei dati
 */
function processInputBeforeSend(inputEl) {
  if (!isProtectionActive) {
    console.log("[CLOKR] Protection disabled, skipping");
    return false;
  }

  const text = getInputText(inputEl);
  if (!text || text.trim().length === 0) return false;

  console.log("[CLOKR] Processing input before send...");

  // Esegui la rilevazione PII
  const detected = window.CLOKR.detectAllPII(text);

  if (detected.length === 0) {
    console.log("[CLOKR] No PII detected in input");
    return false;
  }

  // Maschera il testo
  const { maskedText, items } = window.CLOKR.maskText(text, detected);

  // Aggiorna il campo con il testo mascherato
  setInputText(inputEl, maskedText);

  // Mostra il toast di protezione
  showProtectionToast(detected.length, items);

  // Notifica il background script per aggiornare le statistiche
  try {
    chrome.runtime.sendMessage({
      type:  "PII_MASKED",
      count: detected.length,
      items: items
    });
  } catch (e) {
    // Il background potrebbe non essere disponibile in alcuni contesti
    console.warn("[CLOKR] Could not notify background:", e.message);
  }

  return true;
}

/**
 * Attacca i listener al campo di input di ChatGPT.
 * @param {Element} inputEl - Il campo di input
 */
function attachInputListeners(inputEl) {
  if (watchedInput === inputEl) return; // Già monitorato
  watchedInput = inputEl;

  console.log("[CLOKR] Attaching listeners to input:", inputEl.tagName, inputEl.id || inputEl.className.substring(0, 30));

  /**
   * Intercetta la pressione del tasto Enter per il submit.
   * ChatGPT invia il messaggio su Enter (senza Shift).
   */
  inputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
      console.log("[CLOKR] Enter key detected, processing input...");
      const wasProcessed = processInputBeforeSend(inputEl);
      if (wasProcessed) {
        // Piccola pausa per permettere a React di aggiornare il suo state
        // prima che l'evento keydown venga gestito dal componente React
        // Nota: non bloccheremo mai il submit se il masking fallisce
      }
    }
  }, true); // capture: true per intercettare prima di React

  console.log("[CLOKR] Input listeners attached ✓");
}

/**
 * Attacca listener al pulsante di invio.
 * @param {Element} sendBtn - Il pulsante di invio
 */
function attachSendButtonListener(sendBtn) {
  if (!sendBtn || sendBtn._clokrAttached) return;
  sendBtn._clokrAttached = true;

  sendBtn.addEventListener("click", () => {
    const inputEl = findElement(CHATGPT_SELECTORS.inputField);
    if (inputEl) {
      console.log("[CLOKR] Send button clicked, processing input...");
      processInputBeforeSend(inputEl);
    }
  }, true);

  console.log("[CLOKR] Send button listener attached ✓");
}

// ─── MutationObserver ─────────────────────────────────────

/**
 * Osserva le mutazioni del DOM per rilevare quando ChatGPT
 * aggiunge/aggiorna il campo di input (gestito da React).
 */
const domObserver = new MutationObserver((mutations) => {
  // Cerca il campo di input tra i nodi aggiunti o modificati
  const inputEl = findElement(CHATGPT_SELECTORS.inputField);
  if (inputEl && inputEl !== watchedInput) {
    attachInputListeners(inputEl);
  }

  // Cerca il pulsante di invio
  const sendBtn = findElement(CHATGPT_SELECTORS.sendButton);
  if (sendBtn && !sendBtn._clokrAttached) {
    attachSendButtonListener(sendBtn);
  }
});

// ─── Inizializzazione ─────────────────────────────────────

/**
 * Inizializza l'adapter di ChatGPT.
 * Avvia l'observer del DOM e cerca subito gli elementi.
 */
function initChatGPTAdapter() {
  console.log("[CLOKR] ChatGPT adapter initializing...");

  // Mostra il badge di protezione
  updateShieldBadge();

  // Avvia l'observer sul body
  domObserver.observe(document.body, {
    childList: true,
    subtree:   true
  });

  // Cerca subito gli elementi (potrebbero già essere nel DOM)
  const inputEl = findElement(CHATGPT_SELECTORS.inputField);
  if (inputEl) {
    attachInputListeners(inputEl);
  }

  const sendBtn = findElement(CHATGPT_SELECTORS.sendButton);
  if (sendBtn) {
    attachSendButtonListener(sendBtn);
  }

  // Notifica il background dello site rilevato
  try {
    chrome.runtime.sendMessage({
      type: "SITE_DETECTED",
      site: "ChatGPT"
    });
  } catch (e) {
    console.warn("[CLOKR] Could not notify background of site detection:", e.message);
  }

  console.log("[CLOKR] ChatGPT adapter initialized ✓");
}

// Esporta nel namespace globale per main.js
window.CLOKR.initChatGPTAdapter = initChatGPTAdapter;
