/**
 * Popup page controller (V2).
 * Integrates Developer Panels, Replay Simulators, and logs circular buffers.
 */

import { initDB, getCandles, clearDatabase } from '../storage/db.js';
import { AppLogger } from '../core/logger.js';

let db = null;
let appLogger = null;
let lastPrice = null;

// Circular buffers for developer panel logs
const rawWSBuffer = [];
const parsedCandleBuffer = [];
const BUFFER_LIMIT = 10;

async function getUIStore() {
  if (!db) {
    db = await initDB();
    appLogger = new AppLogger(db);
  }
  return db;
}

document.addEventListener('DOMContentLoaded', async () => {
  // Bind Settings Launcher
  document.getElementById('btn-settings').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // Bind Tab Toggles
  const tabBtns = document.querySelectorAll('.tab-btn');
  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Toggle button active classes
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Toggle content panel visibility
      const tabId = btn.getAttribute('data-tab');
      document.querySelectorAll('.tab-content').forEach(panel => {
        panel.classList.remove('active');
      });
      document.getElementById(tabId).classList.add('active');
    });
  });

  // Action Buttons
  document.getElementById('btn-create-rule').addEventListener('click', handleCreateRule);
  document.getElementById('btn-export-jsonl').addEventListener('click', () => triggerExport('jsonl'));
  document.getElementById('btn-clear-db').addEventListener('click', handleClearDB);

  // Replay Simulator Controls
  document.getElementById('btn-replay-load').addEventListener('click', handleReplayLoad);
  document.getElementById('btn-replay-play').addEventListener('click', () => sendReplayCommand('start'));
  document.getElementById('btn-replay-pause').addEventListener('click', () => sendReplayCommand('pause'));
  document.getElementById('btn-replay-step').addEventListener('click', () => sendReplayCommand('step'));
  document.getElementById('btn-replay-stop').addEventListener('click', () => sendReplayCommand('stop'));

  // Run polling immediately
  pollStatus();
  setInterval(pollStatus, 1500);

  // Render rules
  renderRules();

  // Listen to message broadcasts from service worker
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'CANDLE_UPDATE') {
      updateLiveMonitor(message.candle);
      appendParsedCandle(message.candle);
    }
    if (message.action === 'RAW_WS_FRAME') {
      appendRawFrameLog(message.payload);
    }
  });
});

/**
 * Polls background service worker for status summary details.
 */
function pollStatus() {
  chrome.runtime.sendMessage({ action: 'GET_STATUS' }, (response) => {
    if (chrome.runtime.lastError || !response || !response.success) {
      updateConnectionStatus(false);
      return;
    }

    updateConnectionStatus(true, response.latestCandle);
    updateDiscoveryReport(response.discovery, response.activeProvider);
    updateMetrics(response.stats, response.latestCandle);
    updateLogs(response.logs);
    updateReplayPanel(response.replayState);
  });

  // Check Settings
  chrome.storage.local.get(['settings'], (res) => {
    const el = document.getElementById('metric-gemini');
    const settings = res.settings || {};
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
}

function updateConnectionStatus(isOnline, latestCandle) {
  const pill = document.getElementById('connection-status');
  const text = pill.querySelector('.text');
  
  if (!isOnline) {
    pill.className = 'status-pill disconnected';
    text.textContent = 'Offline';
    return;
  }

  const now = Date.now();
  if (latestCandle && (now - latestCandle.timestamp < 15000)) {
    pill.className = 'status-pill connected';
    text.textContent = 'Streaming';
  } else {
    pill.className = 'status-pill disconnected';
    text.textContent = 'Standby';
  }
}

function updateDiscoveryReport(report, activeProvider) {
  if (!report) return;
  document.getElementById('active-provider').textContent = activeProvider || 'none';
  document.getElementById('discovery-engine').textContent = report.chartEngine || 'Unknown';
  
  const scoreEl = document.getElementById('discovery-confidence');
  const score = report.confidence || 0;
  scoreEl.textContent = score.toFixed(2);

  if (score > 0.8) {
    scoreEl.style.color = 'var(--success)';
  } else if (score > 0.4) {
    scoreEl.style.color = 'var(--warning)';
  } else {
    scoreEl.style.color = 'var(--danger)';
  }
}

function updateMetrics(stats, latestCandle) {
  if (stats) {
    document.getElementById('metric-candles').textContent = stats.totalLogged || 0;
    document.getElementById('perf-db-writes').textContent = `${stats.totalLogged || 0} writes`;
  }
  if (latestCandle) {
    updateLiveMonitor(latestCandle);
  }
}

function updateLiveMonitor(candle) {
  if (!candle) return;
  document.getElementById('metric-symbol').textContent = candle.symbol;

  const priceEl = document.getElementById('metric-price');
  const cur = candle.price;
  priceEl.textContent = cur.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  if (lastPrice !== null && lastPrice !== cur) {
    if (cur > lastPrice) {
      priceEl.style.color = 'var(--success)';
      priceEl.style.textShadow = '0 0 12px var(--success-glow)';
    } else {
      priceEl.style.color = 'var(--danger)';
      priceEl.style.textShadow = '0 0 12px rgba(255, 23, 68, 0.5)';
    }

    setTimeout(() => {
      priceEl.style.color = 'var(--primary)';
      priceEl.style.textShadow = '0 0 10px var(--primary-glow)';
    }, 450);
  }
  lastPrice = cur;
}

function updateLogs(logs) {
  const terminal = document.getElementById('console-logs');
  if (!logs || logs.length === 0) return;

  terminal.innerHTML = '';
  logs.slice(0, 8).reverse().forEach(log => {
    const time = new Date(log.timestamp).toLocaleTimeString();
    const div = document.createElement('div');
    div.className = `log-line ${log.type}`;
    div.textContent = `[${time}] ${log.message}`;
    terminal.appendChild(div);
  });
  terminal.scrollTop = terminal.scrollHeight;
}

function updateReplayPanel(state) {
  if (!state) return;
  
  const infoEl = document.getElementById('replay-info');
  infoEl.textContent = `${state.currentIndex} / ${state.totalCandles} candles`;

  const bar = document.getElementById('replay-progress');
  const pct = state.totalCandles > 0 ? (state.currentIndex / state.totalCandles) * 100 : 0;
  bar.style.width = `${pct}%`;

  const playBtn = document.getElementById('btn-replay-play');
  if (state.isPlaying) {
    playBtn.disabled = true;
    playBtn.textContent = 'Playing...';
  } else {
    playBtn.disabled = false;
    playBtn.textContent = 'Play';
  }
}

// ----------------------------------------------------
// Replay Engine Command routing
// ----------------------------------------------------
async function handleReplayLoad() {
  const infoEl = document.getElementById('replay-info');
  infoEl.textContent = 'Loading simulation data...';

  try {
    const res = await fetch('../logs/candles.jsonl');
    const contentText = await res.text();

    chrome.runtime.sendMessage({
      action: 'REPLAY_COMMAND',
      command: 'load',
      data: contentText
    }, (response) => {
      if (response && response.success) {
        updateReplayPanel(response.replayState);
      }
    });
  } catch (err) {
    alert(`Failed to load replay dataset file: ${err.message}`);
  }
}

function sendReplayCommand(cmd) {
  chrome.runtime.sendMessage({
    action: 'REPLAY_COMMAND',
    command: cmd,
    speed: 1000 // 1 candle per second speed
  }, (response) => {
    if (response && response.success) {
      updateReplayPanel(response.replayState);
    }
  });
}

// ----------------------------------------------------
// Circular logs buffers
// ----------------------------------------------------
function appendRawFrameLog(payload) {
  const terminal = document.getElementById('raw-ws-logs');
  
  rawWSBuffer.push({
    time: new Date().toLocaleTimeString(),
    data: typeof payload === 'string' ? payload.substring(0, 120) : '[Binary Stream Data]'
  });

  if (rawWSBuffer.length > BUFFER_LIMIT) {
    rawWSBuffer.shift();
  }

  terminal.innerHTML = '';
  rawWSBuffer.slice().reverse().forEach(frame => {
    const div = document.createElement('div');
    div.className = 'log-line';
    div.textContent = `[${frame.time}] ${frame.data}`;
    terminal.appendChild(div);
  });
}

function appendParsedCandle(candle) {
  const terminal = document.getElementById('parsed-candles-logs');
  if (!candle) return;

  parsedCandleBuffer.push({
    time: new Date(candle.timestamp).toLocaleTimeString(),
    text: `Symbol: ${candle.symbol} | Price: ${candle.price} | TF: ${candle.timeframe} | Source: ${candle.source}`
  });

  if (parsedCandleBuffer.length > BUFFER_LIMIT) {
    parsedCandleBuffer.shift();
  }

  terminal.innerHTML = '';
  parsedCandleBuffer.slice().reverse().forEach(c => {
    const div = document.createElement('div');
    div.className = 'log-line info';
    div.textContent = `[${c.time}] ${c.text}`;
    terminal.appendChild(div);
  });
}

// ----------------------------------------------------
// AI translation and rule compilations
// ----------------------------------------------------
function handleCreateRule() {
  const input = document.getElementById('prompt-input');
  const button = document.getElementById('btn-create-rule');
  const status = document.getElementById('prompt-status');

  const text = input.value.trim();
  if (!text) return;

  button.disabled = true;
  button.textContent = 'Compiling Rule...';
  status.style.display = 'block';
  status.style.color = 'var(--primary)';
  status.textContent = 'Translating prompt logic...';

  chrome.runtime.sendMessage({
    action: 'TRANSLATE_RULE',
    prompt: text
  }, (response) => {
    button.disabled = false;
    button.textContent = 'Compile & Save Rule';

    if (chrome.runtime.lastError || !response || !response.success) {
      status.style.color = 'var(--danger)';
      status.textContent = `Error: ${response?.error || 'Failed to parse AI output.'}`;
      return;
    }

    const compiledRule = response.rule;
    compiledRule.originalPrompt = text;

    chrome.storage.local.get(['rules'], (res) => {
      const rules = res.rules || [];
      rules.push(compiledRule);
      chrome.storage.local.set({ rules: rules }, () => {
        status.style.color = 'var(--success)';
        status.textContent = `Rule "${compiledRule.name}" compiled and saved successfully!`;
        input.value = '';
        renderRules();

        setTimeout(() => {
          status.style.display = 'none';
        }, 3000);
      });
    });
  });
}

function renderRules() {
  const rulesListEl = document.getElementById('rules-list');

  chrome.storage.local.get(['rules'], (res) => {
    const rules = res.rules || [];
    if (rules.length === 0) {
      rulesListEl.innerHTML = '<div class="center-text">No active rules.</div>';
      return;
    }

    rulesListEl.innerHTML = '';
    rules.forEach(rule => {
      const item = document.createElement('div');
      item.className = 'list-item';

      const main = document.createElement('div');
      main.className = 'item-main';

      const title = document.createElement('div');
      title.className = 'item-title';
      title.textContent = rule.name || 'Custom Rule';

      const desc = document.createElement('div');
      desc.className = 'item-desc';
      desc.textContent = rule.originalPrompt || JSON.stringify(rule.conditions);

      main.appendChild(title);
      main.appendChild(desc);

      const action = document.createElement('div');
      action.className = 'item-action';

      const label = document.createElement('label');
      label.className = 'switch';
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = rule.enabled;
      checkbox.addEventListener('change', () => {
        const updated = rules.map(r => r.id === rule.id ? { ...r, enabled: checkbox.checked } : r);
        chrome.storage.local.set({ rules: updated });
      });

      const slider = document.createElement('span');
      slider.className = 'slider';

      label.appendChild(checkbox);
      label.appendChild(slider);

      const delBtn = document.createElement('button');
      delBtn.className = 'icon-btn';
      delBtn.style.width = '24px';
      delBtn.style.height = '24px';
      delBtn.style.borderColor = 'rgba(255, 23, 68, 0.2)';
      delBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--danger)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>';
      delBtn.addEventListener('click', () => {
        const filtered = rules.filter(r => r.id !== rule.id);
        chrome.storage.local.set({ rules: filtered }, () => renderRules());
      });

      action.appendChild(label);
      action.appendChild(delBtn);

      item.appendChild(main);
      item.appendChild(action);
      rulesListEl.appendChild(item);
    });
  });
}

async function triggerExport(format) {
  try {
    const store = await getUIStore();
    const candles = await getCandles(store, null, null, 10000);

    if (candles.length === 0) {
      alert('No candles in database to export.');
      return;
    }

    const fileContent = appLogger.convertToJSONL(candles);
    const mimeType = 'text/plain;charset=utf-8;';
    const fileName = `quotex_candles_${Date.now()}.jsonl`;

    const blob = new Blob([fileContent], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', fileName);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(`Export failed: ${err.message}`);
  }
}

async function handleClearDB() {
  if (!confirm('Are you sure you want to delete all stored candles and application logs?')) return;
  try {
    const store = await getUIStore();
    await clearDatabase(store);
    pollStatus();
    alert('Database successfully cleared.');
  } catch (err) {
    alert(`Failed to clear database: ${err.message}`);
  }
}
