/**
 * CLOKR — Masking / De-masking Engine
 * ============================================================
 * Sostituisce i dati personali (PII) trovati nel testo con segnaposto
 * anonimi come [EMAIL_1], [CF_1], ecc., e permette di ripristinare
 * il testo originale dal segnaposto.
 *
 * Il motore è SESSION-CONSISTENT: lo stesso valore originale
 * ottiene sempre lo stesso segnaposto all'interno della sessione.
 * Se mando "mario.rossi@email.it" due volte, ricevo sempre [EMAIL_1].
 *
 * Architettura:
 *   - sessionMap   : Map<original_value → placeholder>  (valore → segnaposto)
 *   - reverseMap   : Map<placeholder → original_value>  (segnaposto → valore)
 *   - counters     : Map<type → number>                  (contatori per tipo)
 * ============================================================
 */

// Assicura che il namespace CLOKR esista (pii-detector.js deve essere caricato prima)
window.CLOKR = window.CLOKR || {};

// ─── Stato della sessione in memoria ──────────────────────
// Queste Map vivono per tutta la durata della sessione del browser.
// Non persistono su IndexedDB per semplicità — si resettano al refresh.

/** Map da valore originale al suo segnaposto: "mario@gmail.com" → "[EMAIL_1]" */
const sessionMap = new Map();

/** Map inversa da segnaposto al valore originale: "[EMAIL_1]" → "mario@gmail.com" */
const reverseMap = new Map();

/** Contatori per tipo PII, per generare indici progressivi */
const counters = new Map();

// ─── Utility ──────────────────────────────────────────────

/**
 * Ottiene o crea un segnaposto per un dato valore PII.
 * Garantisce la coerenza: stesso valore → stesso segnaposto.
 *
 * @param {string} type  - Il tipo PII (EMAIL, PHONE, CF, ecc.)
 * @param {string} value - Il valore originale da mascherare
 * @returns {string} Il segnaposto assegnato, es. "[EMAIL_1]"
 */
function getOrCreatePlaceholder(type, value) {
  // Usa il valore in maiuscolo come chiave per case-insensitivity
  const key = `${type}:${value.toLowerCase()}`;

  if (sessionMap.has(key)) {
    return sessionMap.get(key);
  }

  // Incrementa il contatore per questo tipo
  const count = (counters.get(type) || 0) + 1;
  counters.set(type, count);

  // Crea il segnaposto nel formato [TIPO_N]
  const placeholder = `[${type}_${count}]`;

  // Salva nelle map bidirezionali
  sessionMap.set(key, placeholder);
  reverseMap.set(placeholder, value);

  console.log(`[CLOKR] Mapped: "${value}" → "${placeholder}"`);
  return placeholder;
}

/**
 * Genera una versione mascherata del valore per la preview nel popup.
 * Mostra solo i primi e ultimi caratteri per rendere l'elemento riconoscibile.
 * Esempio: "mario.rossi@gmail.com" → "mar***@gmail.com"
 *
 * @param {string} type  - Tipo PII
 * @param {string} value - Valore originale
 * @returns {string} Versione parzialmente mascherata per UI
 */
function createPreview(type, value) {
  switch (type) {
    case "EMAIL": {
      const [local, domain] = value.split("@");
      if (!domain) return value.substring(0, 3) + "***";
      const visibleLocal = local.substring(0, Math.min(3, local.length));
      return `${visibleLocal}***@${domain}`;
    }
    case "PHONE": {
      const digits = value.replace(/\D/g, "");
      return value.substring(0, 3) + "***" + digits.slice(-2);
    }
    case "CF":
      return value.substring(0, 6) + "**********";
    case "IBAN":
      return value.substring(0, 6) + "***" + value.slice(-3);
    case "CARD":
      return "****-****-****-" + value.replace(/\D/g, "").slice(-4);
    case "IP":
      return value.split(".").slice(0, 2).join(".") + ".*.*";
    case "TS":
      return value.substring(0, 4) + "***" + value.slice(-4);
    default:
      return value.substring(0, 3) + "***";
  }
}

// ─── API Pubblica ──────────────────────────────────────────

/**
 * Maschera il testo sostituendo ogni PII rilevato con il suo segnaposto.
 *
 * @param {string} text        - Il testo originale da mascherare
 * @param {Array}  detectedPII - Array di PII rilevati da detectAllPII()
 *                               Ogni elemento: { type, value, start, end }
 * @returns {{ maskedText: string, mappings: Map, items: Array }}
 *   - maskedText: testo con i PII sostituiti dai segnaposto
 *   - mappings:   Map<placeholder → original_value> per questo testo
 *   - items:      Array di item per il popup { type, original, preview, placeholder }
 */
function maskText(text, detectedPII) {
  if (!detectedPII || detectedPII.length === 0) {
    return {
      maskedText: text,
      mappings:   new Map(),
      items:      []
    };
  }

  // Mappings locali per questa operazione specifica
  const localMappings = new Map();
  const items = [];

  // Ricostruisce il testo sostituendo da destra a sinistra
  // (da destra per non invalidare gli indici durante la sostituzione)
  let result = text;
  const piiSorted = [...detectedPII].sort((a, b) => b.start - a.start);

  for (const pii of piiSorted) {
    const placeholder = getOrCreatePlaceholder(pii.type, pii.value);
    const preview = createPreview(pii.type, pii.value);

    // Sostituisce nel testo
    result = result.substring(0, pii.start) + placeholder + result.substring(pii.end);

    // Aggiorna le map locali e la lista per il popup
    localMappings.set(placeholder, pii.value);
    items.push({
      type:        pii.type,
      original:    pii.value,
      preview:     preview,
      placeholder: placeholder
    });
  }

  console.log("[CLOKR] Text masked:", detectedPII.length, "items protected");

  return {
    maskedText: result,
    mappings:   localMappings,
    items:      items
  };
}

/**
 * De-maschera il testo sostituendo i segnaposto con i valori originali.
 * Usato per ripristinare i valori nella risposta dell'AI, se necessario.
 *
 * @param {string} text     - Il testo con segnaposto (es. risposta dell'AI)
 * @param {Map}    mappings - Map<placeholder → original_value> (opzionale)
 *                            Se non fornita, usa la reverseMap globale di sessione.
 * @returns {string} Testo con i valori originali ripristinati
 */
function unmaskText(text, mappings) {
  if (!text) return text;

  // Usa la map fornita, o quella globale di sessione come fallback
  const map = (mappings && mappings.size > 0) ? mappings : reverseMap;

  if (map.size === 0) return text;

  let result = text;

  // Sostituisce ogni segnaposto con il valore originale
  for (const [placeholder, original] of map.entries()) {
    // Usa replaceAll per gestire segnaposto ripetuti nella stessa risposta
    result = result.split(placeholder).join(original);
  }

  return result;
}

/**
 * Resetta lo stato della sessione (segnaposto, contatori, mappe).
 * Utile per test o per reset manuale dall'utente.
 */
function resetSession() {
  sessionMap.clear();
  reverseMap.clear();
  counters.clear();
  console.log("[CLOKR] Session reset ✓");
}

/**
 * Restituisce tutte le mappings della sessione corrente.
 * Utile per debug o per esportare lo stato.
 *
 * @returns {{ sessionMap: Map, reverseMap: Map, counters: Map }}
 */
function getSessionState() {
  return {
    sessionMap: new Map(sessionMap),
    reverseMap: new Map(reverseMap),
    counters:   new Map(counters)
  };
}

// ─── Esportazione nel namespace globale ────────────────────
window.CLOKR.maskText           = maskText;
window.CLOKR.unmaskText         = unmaskText;
window.CLOKR.resetSession       = resetSession;
window.CLOKR.getSessionState    = getSessionState;
window.CLOKR.createPreview      = createPreview;

console.log("[CLOKR] Masker loaded ✓");
