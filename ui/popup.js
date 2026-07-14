/**
 * Popup page controller (V3 Orchestrator).
 * Coordinates modular UI panel views and event listeners.
 */

import { getTabId, startStatusPolling, uiEventBus } from './panels/UIState.js';
import { initInstantAIConfig, handleClearDB } from './panels/SettingsPanel.js';
import strategyLibrary from '../strategies/StrategyLibrary.js';
import {
  updateConnectionStatus,
  updateDiscoveryReport,
  updateMetrics,
  updateReplayPanel,
  updateTelemetry,
  initJSONLExtraction,
  triggerExport
} from './panels/ChartsPanel.js';
import {
  renderStrategies,
  renderRules,
  initLibrary
} from './panels/StrategyPanel.js';
import {
  updateLogs,
  appendRawFrameLog,
  appendParsedCandle
} from './panels/AlertPanel.js';
import { handleCreateRule } from './panels/AITranslatorPanel.js';

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Initialize Panels
  initInstantAIConfig();
  initJSONLExtraction();

  // 2. Bind Basic Settings & Sidebar Launcher Actions
  document.getElementById('btn-settings')?.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  document.getElementById('btn-close-sidebar')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'CLOSE_SIDEBAR' });
  });

  document.getElementById('btn-reload-ext')?.addEventListener('click', () => {
    chrome.runtime.reload();
  });

  // 3. Bind Tab Switching Toggles
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const tabId = btn.getAttribute('data-tab');
      document.querySelectorAll('.tab-content').forEach(panel => {
        panel.classList.remove('active');
      });
      document.getElementById(tabId)?.classList.add('active');
    });
  });

  // 4. Bind Action Click Listeners
  document.getElementById('btn-create-rule')?.addEventListener('click', handleCreateRule);
  document.getElementById('btn-export-jsonl')?.addEventListener('click', () => triggerExport('jsonl'));
  document.getElementById('btn-export-json')?.addEventListener('click', () => triggerExport('json'));
  document.getElementById('btn-export-csv')?.addEventListener('click', () => triggerExport('csv'));
  document.getElementById('btn-clear-db')?.addEventListener('click', handleClearDB);

  // Quick Buttons — One-click pattern rule import
  const quickBtnHandler = (strategyId, btnId) => {
    document.getElementById(btnId)?.addEventListener('click', async () => {
      const statusEl = document.getElementById('quick-btn-status');
      try {
        await strategyLibrary.load();
        const strategy = strategyLibrary.getById(strategyId);
        if (!strategy) {
          if (statusEl) { statusEl.textContent = '⚠ Strategy not found in library.'; statusEl.style.color = 'var(--danger)'; statusEl.style.display = 'block'; }
          return;
        }
        const rule = strategyLibrary.toRule(strategy);
        chrome.storage.local.get(['rules'], (res) => {
          const rules = res.rules || [];
          if (rules.some(r => r.id === rule.id)) {
            if (statusEl) { statusEl.textContent = `⚠ "${strategy.strategyName}" is already active.`; statusEl.style.color = 'var(--warning)'; statusEl.style.display = 'block'; }
            return;
          }
          rules.push(rule);
          chrome.storage.local.set({ rules }, () => {
            if (statusEl) { statusEl.textContent = `✓ "${strategy.strategyName}" added to rules!`; statusEl.style.color = 'var(--success)'; statusEl.style.display = 'block'; }
            renderRules();
            setTimeout(() => { if (statusEl) statusEl.style.display = 'none'; }, 3000);
          });
        });
      } catch (err) {
        if (statusEl) { statusEl.textContent = '⚠ Error importing strategy.'; statusEl.style.color = 'var(--danger)'; statusEl.style.display = 'block'; }
      }
    });
  };
  quickBtnHandler(1001, 'btn-quick-shooting-star');
  quickBtnHandler(1002, 'btn-quick-bull-engulf');

  document.getElementById('btn-kill-switch')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'TOGGLE_KILL_SWITCH' }, (res) => {
      if (res && res.killSwitch !== undefined) {
        const btn = document.getElementById('btn-kill-switch');
        if (res.killSwitch) {
          btn.style.background = 'var(--danger)';
          btn.style.color = '#fff';
        } else {
          btn.style.background = 'rgba(255, 23, 68, 0.1)';
          btn.style.color = 'var(--danger)';
        }
      }
    });
  });

  // 5. Bind Replay Engine Simulator Commands
  document.getElementById('btn-replay-load')?.addEventListener('click', handleReplayLoad);
  document.getElementById('btn-replay-play')?.addEventListener('click', () => sendReplayCommand('start'));
  document.getElementById('btn-replay-pause')?.addEventListener('click', () => sendReplayCommand('pause'));
  document.getElementById('btn-replay-step')?.addEventListener('click', () => sendReplayCommand('step'));
  document.getElementById('btn-replay-stop')?.addEventListener('click', () => sendReplayCommand('stop'));

  // 6. Start Polling Loop & Initial Panel Renders
  startStatusPolling();

  renderRules();
  renderStrategies();

  // 7. Bind Live Stream Message Relays
  let cachedTabId = null;
  getTabId((id) => { cachedTabId = id; });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.tabId !== undefined && cachedTabId !== null && message.tabId !== cachedTabId) {
      return;
    }
    if (message.action === 'CANDLE_UPDATE') {
      appendParsedCandle(message.candle);
    }
    if (message.action === 'RAW_WS_FRAME') {
      appendRawFrameLog(message.payload);
    }
  });
});

uiEventBus.addEventListener('status_update', (e) => {
  const data = e.detail;
  if (!data.isOnline) {
    updateConnectionStatus(false);
    return;
  }
  const response = data.response;
  updateConnectionStatus(true, response.latestCandle);
  if (response.discovery || response.activeProvider) {
    updateDiscoveryReport(response.discovery, response.activeProvider);
  }
  updateMetrics(response.stats, response.latestCandle, response.lastCompletedCandle, response.allStreams);
  updateLogs(response.logs);
  
  // Log the fully closed 1m candles instead of live tick spam
  if (response.lastCompletedCandle) {
    appendParsedCandle(response.lastCompletedCandle);
  }

  updateReplayPanel(response.replayState);
  updateTelemetry(response.state, response.telemetry);

  const btn = document.getElementById('btn-kill-switch');
  if (btn) {
    if (response.killSwitch) {
      btn.style.background = 'var(--danger)';
      btn.style.color = '#fff';
    } else {
      btn.style.background = 'rgba(255, 23, 68, 0.1)';
      btn.style.color = 'var(--danger)';
    }
  }
});

uiEventBus.addEventListener('settings_update', (e) => {
  const el = document.getElementById('metric-gemini');
  if (!el) return;
  const settings = e.detail;
  const provider = settings.aiProvider || 'local';

  if (provider === 'local') {
    el.textContent = 'Local Active';
    el.style.color = 'var(--primary)';
  } else {
    const keyExists = provider === 'gemini' ? !!settings.geminiKey : !!settings.openaiKey;
    if (keyExists) {
      el.textContent = `${provider.toUpperCase()} Ready`;
      el.style.color = 'var(--success)';
    } else {
      el.textContent = `${provider.toUpperCase()} Missing`;
      el.style.color = 'var(--danger)';
    }
  }
});

/**
 * Loads simulation candles from local logs storage.
 */
async function handleReplayLoad() {
  const infoEl = document.getElementById('replay-info');
  if (infoEl) infoEl.textContent = 'Loading simulation data...';

  try {
    const res = await fetch('../logs/candles.jsonl');
    const contentText = await res.text();

    getTabId((tabId) => {
      chrome.runtime.sendMessage({
        action: 'REPLAY_COMMAND',
        command: 'load',
        data: contentText,
        tabId: tabId
      }, (response) => {
        if (response && response.success) {
          updateReplayPanel(response.replayState);
        }
      });
    });
  } catch (err) {
    alert(`Failed to load replay dataset file: ${err.message}`);
  }
}

/**
 * Sends execution directives to the Replay engine.
 */
function sendReplayCommand(cmd) {
  getTabId((tabId) => {
    chrome.runtime.sendMessage({
      action: 'REPLAY_COMMAND',
      command: cmd,
      speed: 1000,
      tabId: tabId
    }, (response) => {
      if (response && response.success) {
        updateReplayPanel(response.replayState);
      }
    });
  });
}

// Lazy load strategy library when its tab button is toggled
let _libInitDone = false;
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('tab-btn-library')?.addEventListener('click', () => {
    if (!_libInitDone) {
      initLibrary().catch(console.error);
      _libInitDone = true;
    }
  });
});
