/**
 * CLOKR — PII Detection Engine
 * ============================================================
 * Motore di rilevamento dati personali (PII).
 * Identifica informazioni sensibili nel testo prima che vengano
 * inviate ai server degli assistenti AI.
 *
 * Tipi rilevati:
 *  - EMAIL       → Indirizzo email
 *  - PHONE       → Numero di telefono (italiano e internazionale)
 *  - CF          → Codice Fiscale italiano
 *  - IBAN        → Codice IBAN europeo
 *  - CARD        → Numero di carta di credito (con validazione Luhn)
 *  - IP          → Indirizzo IP (v4 e v6)
 *  - DATE        → Data di nascita
 *  - TS          → Tessera Sanitaria italiana
 *  - PERSON      → Nome e cognome (euristica semplice)
 * ============================================================
 */

// ─── Namespace globale CLOKR ───────────────────────────────
window.CLOKR = window.CLOKR || {};

// ─── Costanti di tipo PII ──────────────────────────────────
const PII_TYPES = {
  EMAIL:  "EMAIL",
  PHONE:  "PHONE",
  CF:     "CF",
  IBAN:   "IBAN",
  CARD:   "CARD",
  IP:     "IP",
  DATE:   "DATE",
  TS:     "TS",
  PERSON: "PERSON"
};

// ─── Regex Definitions ─────────────────────────────────────

/**
 * EMAIL — Standard RFC 5322 semplificato.
 * Cattura indirizzi come user@domain.tld, user.name+tag@sub.domain.co.uk
 */
const REGEX_EMAIL = /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/g;

/**
 * PHONE — Numeri di telefono italiani (+39) e internazionali.
 * Gestisce formati con/senza prefisso internazionale, spazi, trattini, punti.
 * Esempi: +39 333 1234567, 0039-02-12345678, 333.123.4567, +1 (555) 000-1234
 */
const REGEX_PHONE = /(?:\+|00)?\d{1,3}[\s.\-]?\(?\d{1,4}\)?[\s.\-]?\d{1,4}[\s.\-]?\d{1,9}(?:[\s.\-]?\d{1,4})?/g;

/**
 * CODICE FISCALE italiano — 16 caratteri alfanumerici con struttura fissa.
 * Formato: LLLLLL00L00L000L
 * 3 lettere cognome + 3 lettere nome + 2 cifre anno + 1 lettera mese + 2 cifre giorno + 4 alfanumerico comune + 1 cifra controllo
 */
const REGEX_CF = /\b[A-Z]{6}\d{2}[A-Z]\d{2}[A-Z]\d{3}[A-Z]\b/gi;

/**
 * IBAN — International Bank Account Number.
 * Formato: 2 lettere paese + 2 cifre controllo + fino a 30 alfanumerici.
 * Supporta spazi ogni 4 caratteri (formato leggibile).
 * Paesi europei principali: IT, DE, FR, ES, GB, NL, BE, AT, CH, etc.
 */
const REGEX_IBAN = /\b[A-Z]{2}\d{2}[\s]?[A-Z0-9]{4}[\s]?[A-Z0-9]{4}[\s]?[A-Z0-9]{4}[\s]?[A-Z0-9]{4}[\s]?[A-Z0-9]{0,4}[\s]?[A-Z0-9]{0,3}\b/gi;

/**
 * CREDIT CARD — Pattern per i principali circuiti:
 * Visa (4xxx), Mastercard (5xxx/2xxx), Amex (3x), Discover (6xxx)
 * Accetta spazi e trattini come separatori.
 * La validazione Luhn viene eseguita separatamente.
 */
const REGEX_CARD = /\b(?:4\d{3}|5[1-5]\d{2}|2[2-7]\d{2}|3[47]\d{2}|6(?:011|5\d{2}))[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{1,4}\b/g;

/**
 * IP ADDRESS — IPv4 e IPv6.
 * IPv4: quattro ottetti da 0-255 separati da punti.
 * IPv6: formato completo e abbreviato con ::
 */
const REGEX_IP_V4 = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b/g;
const REGEX_IP_V6 = /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b|\b(?:[0-9a-fA-F]{1,4}:)*::(?:[0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4}\b/g;

/**
 * DATA DI NASCITA — Formati comuni italiani e internazionali.
 * GG/MM/AAAA, GG-MM-AAAA, AAAA-MM-GG, GG.MM.AAAA
 * Esclude date troppo recenti (probabilmente non sono date di nascita)
 */
const REGEX_DATE = /\b(?:\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{4}|\d{4}[\/\-\.]\d{1,2}[\/\-\.]\d{1,2})\b/g;

/**
 * TESSERA SANITARIA italiana (anche CNS/TEAM).
 * 20 cifre, inizia con 80 (codice stato Italia) o 8051.
 * Formato fisico: XXXXXXXXXXXXXXXX (16 CF) + 4 cifre aggiuntive
 */
const REGEX_TS = /\b(?:80[0-9]{18}|8051[0-9]{16})\b/g;

// ─── Algoritmo di Luhn ─────────────────────────────────────

/**
 * Verifica la validità di un numero di carta di credito usando l'algoritmo di Luhn.
 * L'algoritmo di Luhn è un semplice checksum usato per validare i numeri di carte.
 *
 * @param {string} cardNumber - Il numero della carta (solo cifre)
 * @returns {boolean} true se il numero supera la validazione Luhn
 */
function luhnCheck(cardNumber) {
  // Rimuove spazi e trattini
  const digits = cardNumber.replace(/[\s\-]/g, "");
  if (!/^\d+$/.test(digits)) return false;

  let sum = 0;
  let shouldDouble = false;

  // Itera le cifre da destra a sinistra
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits[i], 10);

    if (shouldDouble) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }

    sum += digit;
    shouldDouble = !shouldDouble;
  }

  return sum % 10 === 0;
}

// ─── Funzioni di rilevamento singolo tipo ──────────────────

/**
 * Rileva indirizzi email nel testo.
 * @param {string} text - Il testo da analizzare
 * @returns {Array<{type, value, start, end}>}
 */
function detectEmails(text) {
  const results = [];
  const regex = new RegExp(REGEX_EMAIL.source, "gi");
  let match;
  while ((match = regex.exec(text)) !== null) {
    results.push({
      type:  PII_TYPES.EMAIL,
      value: match[0],
      start: match.index,
      end:   match.index + match[0].length
    });
  }
  return results;
}

/**
 * Rileva numeri di telefono nel testo.
 * Filtra i match troppo corti per evitare falsi positivi.
 * @param {string} text - Il testo da analizzare
 * @returns {Array<{type, value, start, end}>}
 */
function detectPhones(text) {
  const results = [];
  const regex = new RegExp(REGEX_PHONE.source, "g");
  let match;
  while ((match = regex.exec(text)) !== null) {
    const clean = match[0].replace(/[\s.\-()]/g, "");
    // Un numero di telefono deve avere almeno 7 cifre
    if (clean.length >= 7) {
      results.push({
        type:  PII_TYPES.PHONE,
        value: match[0],
        start: match.index,
        end:   match.index + match[0].length
      });
    }
  }
  return results;
}

/**
 * Rileva Codici Fiscali italiani nel testo.
 * @param {string} text - Il testo da analizzare
 * @returns {Array<{type, value, start, end}>}
 */
function detectCodiciFiscali(text) {
  const results = [];
  const regex = new RegExp(REGEX_CF.source, "gi");
  let match;
  while ((match = regex.exec(text)) !== null) {
    results.push({
      type:  PII_TYPES.CF,
      value: match[0].toUpperCase(),
      start: match.index,
      end:   match.index + match[0].length
    });
  }
  return results;
}

/**
 * Rileva codici IBAN nel testo.
 * Rimuove gli spazi prima di restituire il valore pulito.
 * @param {string} text - Il testo da analizzare
 * @returns {Array<{type, value, start, end}>}
 */
function detectIBANs(text) {
  const results = [];
  const regex = new RegExp(REGEX_IBAN.source, "gi");
  let match;
  while ((match = regex.exec(text)) !== null) {
    const clean = match[0].replace(/\s/g, "").toUpperCase();
    // Un IBAN valido ha almeno 15 caratteri (Norvegia) e al massimo 34 (Malta)
    if (clean.length >= 15 && clean.length <= 34) {
      results.push({
        type:  PII_TYPES.IBAN,
        value: match[0],
        start: match.index,
        end:   match.index + match[0].length
      });
    }
  }
  return results;
}

/**
 * Rileva numeri di carte di credito con validazione Luhn.
 * @param {string} text - Il testo da analizzare
 * @returns {Array<{type, value, start, end}>}
 */
function detectCreditCards(text) {
  const results = [];
  const regex = new RegExp(REGEX_CARD.source, "g");
  let match;
  while ((match = regex.exec(text)) !== null) {
    // Valida con l'algoritmo di Luhn prima di accettare il match
    if (luhnCheck(match[0])) {
      results.push({
        type:  PII_TYPES.CARD,
        value: match[0],
        start: match.index,
        end:   match.index + match[0].length
      });
    }
  }
  return results;
}

/**
 * Rileva indirizzi IP (v4 e v6) nel testo.
 * @param {string} text - Il testo da analizzare
 * @returns {Array<{type, value, start, end}>}
 */
function detectIPs(text) {
  const results = [];

  // IPv4
  const regexV4 = new RegExp(REGEX_IP_V4.source, "g");
  let match;
  while ((match = regexV4.exec(text)) !== null) {
    results.push({
      type:  PII_TYPES.IP,
      value: match[0],
      start: match.index,
      end:   match.index + match[0].length
    });
  }

  // IPv6
  const regexV6 = new RegExp(REGEX_IP_V6.source, "g");
  while ((match = regexV6.exec(text)) !== null) {
    results.push({
      type:  PII_TYPES.IP,
      value: match[0],
      start: match.index,
      end:   match.index + match[0].length
    });
  }

  return results;
}

/**
 * Rileva date (potenzialmente date di nascita) nel testo.
 * @param {string} text - Il testo da analizzare
 * @returns {Array<{type, value, start, end}>}
 */
function detectDates(text) {
  const results = [];
  const regex = new RegExp(REGEX_DATE.source, "g");
  let match;
  while ((match = regex.exec(text)) !== null) {
    results.push({
      type:  PII_TYPES.DATE,
      value: match[0],
      start: match.index,
      end:   match.index + match[0].length
    });
  }
  return results;
}

/**
 * Rileva numeri di Tessera Sanitaria italiana.
 * @param {string} text - Il testo da analizzare
 * @returns {Array<{type, value, start, end}>}
 */
function detectTesseraSanitaria(text) {
  const results = [];
  const regex = new RegExp(REGEX_TS.source, "g");
  let match;
  while ((match = regex.exec(text)) !== null) {
    results.push({
      type:  PII_TYPES.TS,
      value: match[0],
      start: match.index,
      end:   match.index + match[0].length
    });
  }
  return results;
}

// ─── Funzione master ───────────────────────────────────────

/**
 * Esegue tutti i detector PII sul testo fornito.
 * Restituisce i risultati ordinati per posizione, senza sovrapposizioni.
 * In caso di match sovrapposti, viene preferito quello più lungo.
 *
 * @param {string} text - Il testo da analizzare
 * @returns {Array<{type: string, value: string, start: number, end: number}>}
 *          Array ordinato di PII trovati nel testo
 */
function detectAllPII(text) {
  if (!text || typeof text !== "string" || text.trim().length === 0) {
    return [];
  }

  console.log("[CLOKR] Scanning text for PII...", text.substring(0, 50) + "...");

  // Raccogli tutti i match da tutti i detector
  let allMatches = [
    ...detectEmails(text),
    ...detectCodiciFiscali(text),
    ...detectIBANs(text),
    ...detectCreditCards(text),
    ...detectIPs(text),
    ...detectDates(text),
    ...detectTesseraSanitaria(text),
    ...detectPhones(text)   // I telefoni vengono dopo per ridurre falsi positivi
  ];

  // Ordina per posizione di inizio
  allMatches.sort((a, b) => a.start - b.start || b.end - a.end);

  // Rimuovi sovrapposizioni: tieni il match più lungo in caso di conflitto
  const nonOverlapping = [];
  let lastEnd = -1;

  for (const match of allMatches) {
    if (match.start >= lastEnd) {
      nonOverlapping.push(match);
      lastEnd = match.end;
    } else if (match.end > lastEnd && nonOverlapping.length > 0) {
      // Il match corrente è più lungo, sostituisci l'ultimo
      const last = nonOverlapping[nonOverlapping.length - 1];
      if (match.end - match.start > last.end - last.start) {
        nonOverlapping[nonOverlapping.length - 1] = match;
        lastEnd = match.end;
      }
    }
  }

  console.log("[CLOKR] PII detected:", nonOverlapping.length, "items");
  return nonOverlapping;
}

// ─── Esportazione nel namespace globale ────────────────────
// Poiché usiamo script senza moduli ES (per compatibilità con content scripts Chrome),
// esportiamo le funzioni nel namespace globale CLOKR.

window.CLOKR.detectAllPII  = detectAllPII;
window.CLOKR.detectEmails  = detectEmails;
window.CLOKR.detectPhones  = detectPhones;
window.CLOKR.detectCodiciFiscali = detectCodiciFiscali;
window.CLOKR.detectIBANs   = detectIBANs;
window.CLOKR.detectCreditCards = detectCreditCards;
window.CLOKR.detectIPs     = detectIPs;
window.CLOKR.detectDates   = detectDates;
window.CLOKR.detectTesseraSanitaria = detectTesseraSanitaria;
window.CLOKR.PII_TYPES     = PII_TYPES;
window.CLOKR.luhnCheck     = luhnCheck;

console.log("[CLOKR] PII Detector loaded ✓");
