/**
 * CLOKR Background Service Worker
 * Gestisce lo stato globale e la comunicazione tra popup e content scripts.
 * Handles global state and communication between popup and content scripts.
 */

console.log("[CLOKR] Background service worker started");

// Inizializza i dati di storage al primo avvio
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    enabled: true,
    totalProtected: 0,
    sessionHistory: [],
    detectedSite: null
  });
  console.log("[CLOKR] Extension installed, storage initialized");
});

// Ascolta messaggi dai content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "PII_MASKED") {
    // Aggiorna il contatore di elementi protetti
    chrome.storage.local.get(["totalProtected", "sessionHistory"], (data) => {
      const newTotal = (data.totalProtected || 0) + (message.count || 0);
      const history = data.sessionHistory || [];

      // Aggiungi i nuovi item alla cronologia (max 20)
      if (message.items && message.items.length > 0) {
        const newItems = message.items.map(item => ({
          ...item,
          timestamp: Date.now()
        }));
        const updatedHistory = [...newItems, ...history].slice(0, 20);
        chrome.storage.local.set({
          totalProtected: newTotal,
          sessionHistory: updatedHistory
        });
      } else {
        chrome.storage.local.set({ totalProtected: newTotal });
      }
    });
    sendResponse({ ok: true });
  }

  if (message.type === "SITE_DETECTED") {
    chrome.storage.local.set({ detectedSite: message.site });
    sendResponse({ ok: true });
  }

  // Return true to keep message channel open for async response
  return true;
});
