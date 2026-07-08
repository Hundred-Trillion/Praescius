/**
 * Lifecycle and Startup manager.
 */
import { initDB } from '../storage/db.js';
import { providerManager } from '../providers/providerManager.js';
import { AppLogger } from '../core/logger.js';
import { stateMachine } from '../core/stateMachine.js';
import { eventBus } from '../core/eventBus.js';
import { globalState, adaptiveConfidences } from './state.js';

export async function getDB() {
  if (!globalState.db) {
    globalState.db = await initDB();
    globalState.appLogger = new AppLogger(globalState.db);
  }
  return globalState.db;
}

export async function startup() {
  try {
    await getDB();
    await providerManager.loadPlugins();
    stateMachine.transitionTo('CONNECTING');
    
    chrome.storage.local.get(['adaptiveConfidences'], (res) => {
      if (res.adaptiveConfidences) {
        Object.assign(adaptiveConfidences, res.adaptiveConfidences);
      }
    });
  } catch (err) {
    console.error('[Background] Startup error:', err);
  }
}

export function registerLifecycle() {
  chrome.runtime.onInstalled.addListener(async () => {
    try {
      await startup();
      eventBus.publish('system.logs.v1', { message: 'Praescius V2 installed and initialized successfully.', type: 'info' });
      
      chrome.storage.local.get(['settings', 'rules'], (res) => {
        if (!res.settings) {
          chrome.storage.local.set({
            settings: {
              aiProvider: 'gemini',
              geminiKey: '',
              openaiKey: '',
              notificationsEnabled: true,
              loggingEnabled: true,
              debugMode: false
            }
          });
        }
        if (!res.rules) {
          chrome.storage.local.set({ rules: [] });
        }
      });
    } catch (err) {
      console.error('Service worker installation failure:', err);
    }
  });

  chrome.action.onClicked.addListener((tab) => {
    if (!tab || !tab.id) return;
    chrome.storage.local.get(['sidebarOpen'], (res) => {
      const nextState = !res.sidebarOpen;
      chrome.storage.local.set({ sidebarOpen: nextState }, () => {
        chrome.tabs.sendMessage(tab.id, { action: 'SET_SIDEBAR_STATE', open: nextState }, () => {
          if (chrome.runtime.lastError) {
            // ignore
          }
        });
      });
    });
  });
}
