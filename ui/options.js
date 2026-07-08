/**
 * Options page controller (ES Module).
 * Coordinates configuration panel, developer simulations, and portfolio analysis.
 */

import { getTabId, startStatusPolling, uiEventBus } from './panels/UIState.js';
import {
  updateConnectionStatus,
  updateDiscoveryReport,
  updateMetrics,
  updateReplayPanel,
  updateTelemetry,
  triggerExport,
  exportRecentCandles
} from './panels/ChartsPanel.js';
import { handleClearDB } from './panels/SettingsPanel.js';
import {
  updateLogs,
  appendRawFrameLog,
  appendParsedCandle
} from './panels/AlertPanel.js';

document.addEventListener('DOMContentLoaded', () => {
  const providerSelect = document.getElementById('ai-provider');
  const geminiGroup = document.getElementById('gemini-key-group');
  const openaiGroup = document.getElementById('openai-key-group');

  const geminiKeyInput = document.getElementById('api-key-gemini');
  const openaiKeyInput = document.getElementById('api-key-openai');
  
  const geminiModelSelect = document.getElementById('model-gemini');
  const openaiModelSelect = document.getElementById('model-openai');
  
  const notifyCheck = document.getElementById('toggle-notifications');
  const loggingCheck = document.getElementById('toggle-logging');

  const saveBtn = document.getElementById('btn-save-settings');
  const testBtn = document.getElementById('btn-test-notification');
  const statusSpan = document.getElementById('save-status');

  // Load initial settings
  chrome.storage.local.get(['settings'], (res) => {
    const settings = res.settings || {};
    
    if (providerSelect) providerSelect.value = settings.aiProvider || 'local';
    if (geminiKeyInput) geminiKeyInput.value = settings.geminiKey || '';
    if (openaiKeyInput) openaiKeyInput.value = settings.openaiKey || '';
    if (geminiModelSelect) geminiModelSelect.value = settings.geminiModel || 'gemini-2.5-flash';
    if (openaiModelSelect) openaiModelSelect.value = settings.openaiModel || 'gpt-4o-mini';
    if (notifyCheck) notifyCheck.checked = settings.notificationsEnabled !== false;
    if (loggingCheck) loggingCheck.checked = settings.loggingEnabled !== false;

    if (providerSelect) updateKeyFieldVisibility(providerSelect.value);
  });

  // Handle provider switches
  providerSelect?.addEventListener('change', () => {
    updateKeyFieldVisibility(providerSelect.value);
  });

  // Save settings handler
  saveBtn?.addEventListener('click', () => {
    const updatedSettings = {
      aiProvider: providerSelect.value,
      geminiKey: geminiKeyInput.value.trim(),
      openaiKey: openaiKeyInput.value.trim(),
      geminiModel: geminiModelSelect.value,
      openaiModel: openaiModelSelect.value,
      notificationsEnabled: notifyCheck.checked,
      loggingEnabled: loggingCheck.checked
    };

    chrome.storage.local.set({ settings: updatedSettings }, () => {
      if (statusSpan) {
        statusSpan.style.display = 'inline';
        statusSpan.style.color = 'var(--success)';
        statusSpan.textContent = 'Settings saved!';
        setTimeout(() => {
          statusSpan.style.display = 'none';
        }, 2500);
      }
    });
  });

  // Test Notification handler
  testBtn?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'TEST_NOTIFICATION' }, (res) => {
      if (chrome.runtime.lastError || !res || !res.success) {
        alert('Verification request failed. Ensure background page is active.');
      }
    });
  });

  function updateKeyFieldVisibility(provider) {
    if (!geminiGroup || !openaiGroup) return;
    geminiGroup.classList.remove('active');
    openaiGroup.classList.remove('active');

    if (provider === 'gemini') {
      geminiGroup.classList.add('active');
    } else if (provider === 'openai') {
      openaiGroup.classList.add('active');
    }
  }

  // Bind Options Page Tab Switching Toggles
  const tabBtns = document.querySelectorAll('.options-tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const tabId = btn.getAttribute('data-tab');
      document.querySelectorAll('.options-tab-content').forEach(panel => {
        panel.style.display = 'none';
      });
      const targetPanel = document.getElementById(tabId);
      if (targetPanel) {
        targetPanel.style.display = 'block';
      }
    });
  });

  // Portfolio Hub sub-tab switching
  const portTabBtns = document.querySelectorAll('.portfolio-tab-btn');
  portTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      portTabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      const subId = btn.getAttribute('data-subtab');
      document.querySelectorAll('.portfolio-subtab').forEach(panel => {
        panel.style.display = 'none';
      });
      const targetPanel = document.getElementById(subId);
      if (targetPanel) {
        targetPanel.style.display = 'block';
      }
    });
  });

  // Bind Data Diagnostics Commands
  document.getElementById('btn-export-jsonl')?.addEventListener('click', () => triggerExport('jsonl'));
  document.getElementById('btn-export-15m')?.addEventListener('click', () => exportRecentCandles(15));
  document.getElementById('btn-export-30m')?.addEventListener('click', () => exportRecentCandles(30));
  document.getElementById('btn-clear-db')?.addEventListener('click', handleClearDB);

  // Bind Replay Engine Simulator Commands inside Options Page
  document.getElementById('btn-replay-load')?.addEventListener('click', handleReplayLoad);
  document.getElementById('btn-replay-play')?.addEventListener('click', () => sendReplayCommand('start'));
  document.getElementById('btn-replay-pause')?.addEventListener('click', () => sendReplayCommand('pause'));
  document.getElementById('btn-replay-step')?.addEventListener('click', () => sendReplayCommand('step'));
  document.getElementById('btn-replay-stop')?.addEventListener('click', () => sendReplayCommand('stop'));

  // Start status polling inside options page to show live metrics & logs
  startStatusPolling();

  // Bind Live Stream Message Relays to options logs
  chrome.runtime.onMessage.addListener((message) => {
    getTabId((tabId) => {
      if (message.tabId !== undefined && message.tabId !== tabId) {
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
});

uiEventBus.addEventListener('status_update', (e) => {
  const data = e.detail;
  if (!data.isOnline) {
    updateConnectionStatus(false);
    return;
  }
  const response = data.response;
  updateConnectionStatus(true, response.latestCandle);
  updateDiscoveryReport(response.discovery, response.activeProvider);
  updateMetrics(response.stats, response.latestCandle);
  updateLogs(response.logs);
  updateReplayPanel(response.replayState);
  updateTelemetry(response.state, response.telemetry);
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

async function handleReplayLoad() {
  const infoEl = document.getElementById('replay-info');
  if (infoEl) infoEl.textContent = 'Loading simulation data...';

  try {
    const url = chrome.runtime.getURL('logs/candles.jsonl');
    const res = await fetch(url);
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
