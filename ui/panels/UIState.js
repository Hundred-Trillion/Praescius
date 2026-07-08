/**
 * Shared UI State & Helpers.
 */
import { initDB } from '../../storage/db.js';
import { AppLogger } from '../../core/logger.js';

let db = null;
let appLogger = null;
let cachedTabId = null;

export async function getUIStore() {
  if (!db) {
    db = await initDB();
    appLogger = new AppLogger(db);
  }
  return { db, appLogger };
}

export function getTabId(callback) {
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ action: 'GET_ACTIVE_SESSION_ID' }, (response) => {
      if (response && response.tabId) {
        callback(response.tabId);
      } else {
        // Fallback to active window query if background is unresponsive
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          if (tabs && tabs.length > 0) {
            callback(tabs[0].id);
          } else {
            callback('default');
          }
        });
      }
    });
  } else {
    callback('default');
  }
}

export const uiEventBus = new EventTarget();

export function startStatusPolling() {
  setInterval(pollStatus, 1500);
  pollStatus();
}

function pollStatus() {
  getTabId((tabId) => {
    chrome.runtime.sendMessage({ action: 'GET_STATUS', tabId: tabId }, (response) => {
      if (chrome.runtime.lastError || !response || !response.success) {
        uiEventBus.dispatchEvent(new CustomEvent('status_update', { detail: { isOnline: false } }));
        return;
      }
      uiEventBus.dispatchEvent(new CustomEvent('status_update', { detail: { isOnline: true, response } }));
    });
  });

  chrome.storage.local.get(['settings'], (res) => {
    uiEventBus.dispatchEvent(new CustomEvent('settings_update', { detail: res.settings || {} }));
  });
}
