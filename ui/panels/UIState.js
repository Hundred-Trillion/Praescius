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
  const fallback = () => {
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs && chrome.tabs.query) {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          try {
            if (chrome.runtime && chrome.runtime.lastError) {
              return callback('default');
            }
            if (tabs && tabs.length > 0) callback(tabs[0].id);
            else callback('default');
          } catch (e) {
            callback('default');
          }
        });
      } else {
        callback('default');
      }
    } catch (e) {
      callback('default');
    }
  };

  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    try {
      chrome.runtime.sendMessage({ action: 'GET_ACTIVE_SESSION_ID' }, (response) => {
        try {
          if (chrome.runtime && chrome.runtime.lastError || !response || !response.tabId) {
            fallback();
          } else {
            callback(response.tabId);
          }
        } catch (err) {
          fallback();
        }
      });
    } catch (err) {
      fallback();
    }
  } else {
    fallback();
  }
}

export const uiEventBus = new EventTarget();

export function startStatusPolling() {
  setInterval(pollStatus, 1500);
  pollStatus();
}

function pollStatus() {
  getTabId((tabId) => {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
      try {
        chrome.runtime.sendMessage({ action: 'GET_STATUS', tabId: tabId }, (response) => {
          try {
            if (chrome.runtime && chrome.runtime.lastError || !response || !response.success) {
              uiEventBus.dispatchEvent(new CustomEvent('status_update', { detail: { isOnline: false } }));
              return;
            }
            uiEventBus.dispatchEvent(new CustomEvent('status_update', { detail: { isOnline: true, response } }));
          } catch (e) {
            uiEventBus.dispatchEvent(new CustomEvent('status_update', { detail: { isOnline: false } }));
          }
        });
      } catch (e) {}
    }
  });

  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    try {
      chrome.storage.local.get(['settings'], (res) => {
        try {
          if (chrome.runtime && chrome.runtime.lastError) return;
          uiEventBus.dispatchEvent(new CustomEvent('settings_update', { detail: res.settings || {} }));
        } catch (e) {}
      });
    } catch (e) {}
  }
}
