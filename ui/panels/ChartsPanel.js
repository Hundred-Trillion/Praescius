/**
 * Charts, Telemetry and Extraction Panel Controller.
 */
import { getCandles } from '../../storage/db.js';
import { getUIStore, getTabId } from './UIState.js';

let lastPrice = null;

export function updateConnectionStatus(isOnline, latestCandle) {
  const pill = document.getElementById('connection-status');
  const text = pill ? pill.querySelector('.text') : null;
  if (!pill || !text) return;
  
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

export function updateDiscoveryReport(report, activeProvider) {
  const provEl = document.getElementById('disc-broker');
  if (provEl) {
    const dataSource = report ? report.dataSource : 'WebSocket Stream';
    const pName = typeof activeProvider === 'string' ? activeProvider : (activeProvider ? activeProvider.name : null);
    provEl.textContent = (pName && pName !== 'none') ? pName.toUpperCase() : (dataSource || 'Scanning...');
  }
}

export function updateLiveMonitor(candle, lastCompletedCandle) {
  if (!candle) return;
  const symEl = document.getElementById('disc-asset');
  const priceEl = document.getElementById('live-price');
  if (symEl) symEl.textContent = candle.symbol;
  if (!priceEl) return;

  const cur = candle.price !== undefined ? candle.price : candle.close;
  priceEl.textContent = cur.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 10 });

  if (lastPrice !== null && lastPrice !== cur) {
    if (cur > lastPrice) {
      priceEl.style.color = 'var(--success)';
      priceEl.style.textShadow = '0 0 12px var(--success-glow)';
    } else {
      priceEl.style.color = 'var(--danger)';
      priceEl.style.textShadow = '0 0 12px rgba(255, 23, 68, 0.5)';
    }

    setTimeout(() => {
      priceEl.style.color = '';
      priceEl.style.textShadow = '';
    }, 450);
  }
  lastPrice = cur;

  const changeEl = document.getElementById('live-change');
  if (changeEl && candle.open) {
    const chg = ((cur - candle.open) / candle.open) * 100;
    changeEl.textContent = (chg > 0 ? '+' : '') + chg.toFixed(5) + '%';
    changeEl.style.color = chg >= 0 ? 'var(--success)' : 'var(--danger)';
  }

  const ohlcEl = document.getElementById('live-ohlc');
  if (ohlcEl && candle.open !== undefined) {
    ohlcEl.textContent = `O:${candle.open.toFixed(6)} H:${candle.high.toFixed(6)} L:${candle.low.toFixed(6)} C:${candle.close.toFixed(6)}`;
  }
  
  const lastOhlcEl = document.getElementById('last-ohlc');
  if (lastOhlcEl && lastCompletedCandle && lastCompletedCandle.open !== undefined) {
    lastOhlcEl.textContent = `O:${lastCompletedCandle.open.toFixed(6)} H:${lastCompletedCandle.high.toFixed(6)} L:${lastCompletedCandle.low.toFixed(6)} C:${lastCompletedCandle.close.toFixed(6)}`;
  }
  
  const tickVolEl = document.getElementById('live-tick-vol');
  if (tickVolEl && candle.volume !== undefined) {
    tickVolEl.textContent = `${candle.volume} ticks`;
  }
  
  const emaEl = document.getElementById('live-ema');
  if (emaEl && candle.ema9 !== undefined && candle.ema21 !== undefined) {
    const trendText = candle.ema9 > candle.ema21 ? 'Bullish (9>21)' : (candle.ema9 < candle.ema21 ? 'Bearish (9<21)' : 'Neutral');
    const color = candle.ema9 > candle.ema21 ? 'var(--success)' : (candle.ema9 < candle.ema21 ? 'var(--danger)' : 'var(--text-muted)');
    emaEl.innerHTML = `<span style="color: ${color};">${candle.ema9.toFixed(6)} / ${candle.ema21.toFixed(6)} [${trendText}]</span>`;
  }

  const regimeEl = document.getElementById('live-regime');
  if (regimeEl && candle.regime) {
    regimeEl.textContent = candle.regime;
    if (candle.regime.includes('Bull')) regimeEl.style.color = 'var(--success)';
    else if (candle.regime.includes('Bear')) regimeEl.style.color = 'var(--danger)';
    else regimeEl.style.color = 'var(--warning)';
  }
}

export function updateMetrics(stats, latestCandle, lastCompletedCandle) {
  const candlesEl = document.getElementById('metric-candles');
  const dbWritesEl = document.getElementById('perf-db-writes');

  if (stats) {
    if (candlesEl) candlesEl.textContent = stats.totalLogged || 0;
    if (dbWritesEl) dbWritesEl.textContent = `${stats.totalLogged || 0} writes`;
  }
  if (latestCandle) {
    updateLiveMonitor(latestCandle, lastCompletedCandle);
  }
}

export function updateReplayPanel(state) {
  if (!state) return;
  
  const infoEl = document.getElementById('replay-info');
  if (infoEl) infoEl.textContent = `${state.currentIndex} / ${state.totalCandles} candles`;

  const bar = document.getElementById('replay-progress');
  if (bar) {
    const pct = state.totalCandles > 0 ? (state.currentIndex / state.totalCandles) * 100 : 0;
    bar.style.width = `${pct}%`;
  }

  const playBtn = document.getElementById('btn-replay-play');
  if (playBtn) {
    if (state.isPlaying) {
      playBtn.disabled = true;
      playBtn.textContent = 'Playing...';
    } else {
      playBtn.disabled = false;
      playBtn.textContent = 'Play';
    }
  }
}

export function updateTelemetry(state, tel) {
  const stateEl = document.getElementById('system-state');
  const optConnEl = document.getElementById('telemetry-connected');
  
  if (stateEl) {
    stateEl.textContent = state || 'OFFLINE';
    if (state === 'LIVE_WS') stateEl.style.color = 'var(--success)';
    else if (state === 'LIVE_DOM') stateEl.style.color = 'var(--warning)';
    else if (state === 'REPLAY') stateEl.style.color = 'var(--primary)';
    else if (state === 'ERROR') stateEl.style.color = 'var(--danger)';
    else stateEl.style.color = 'var(--text-muted)';
  }

  if (optConnEl) {
    optConnEl.textContent = state || 'DISCONNECTED';
    optConnEl.style.color = (state === 'LIVE_WS' || state === 'LIVE_DOM') ? 'var(--success)' : 'var(--danger)';
  }

  if (!tel) return;

  const wsUptimeEl = document.getElementById('tel-ws-uptime');
  if (wsUptimeEl) wsUptimeEl.textContent = `${tel.wsUptimeSeconds || 0}s`;

  const domUptimeEl = document.getElementById('tel-dom-uptime');
  if (domUptimeEl) domUptimeEl.textContent = `${tel.domUptimeSeconds || 0}s`;

  const provLatEl = document.getElementById('tel-prov-lat');
  const optLatEl = document.getElementById('telemetry-latency');
  const avgLat = `${(tel.avgProviderLatencyMs || 0).toFixed(2)}ms`;
  if (provLatEl) provLatEl.textContent = avgLat;
  if (optLatEl) optLatEl.textContent = avgLat;

  const notifLatEl = document.getElementById('tel-notif-lat');
  if (notifLatEl) notifLatEl.textContent = `${(tel.avgNotificationLatencyMs || 0).toFixed(0)}ms`;

  const selFailsEl = document.getElementById('tel-selector-fails');
  if (selFailsEl) selFailsEl.textContent = tel.selectorFailures || 0;

  const optCacheEl = document.getElementById('telemetry-cache-hits');
  if (optCacheEl) {
    const perf = tel.evaluatorPerformance || {};
    optCacheEl.textContent = `${perf.cacheHits || 0} / ${perf.cacheMisses || 0}`;
  }

  const optRateEl = document.getElementById('telemetry-rate');
  if (optRateEl) {
    optRateEl.textContent = `${tel.evaluationsPerSecond || 0} fps`;
  }

  const replayPerfEl = document.getElementById('tel-replay-perf');
  if (replayPerfEl) {
    const perf = tel.replayPerformance || {};
    replayPerfEl.textContent = `${(perf.avgTickProcessingTimeMs || 0).toFixed(3)}ms`;
  }
}

export function initJSONLExtraction() {
  const btnStart = document.getElementById('btn-capture-start');
  const btnStop = document.getElementById('btn-capture-stop');
  const statusEl = document.getElementById('capture-status');
  const btnExtract = document.getElementById('btn-extract-jsonl');
  const extractWindow = document.getElementById('extract-window');
  const tfFilter = document.getElementById('extract-tf-filter');

  if (!btnStart || !btnStop || !statusEl || !btnExtract) return;

  chrome.storage.local.get(['captureState'], (res) => {
    const state = res.captureState || { isCapturing: false, startTime: null };
    updateCaptureUI(state);
  });

  function updateCaptureUI(state) {
    if (state.isCapturing) {
      btnStart.disabled = true;
      btnStart.style.opacity = '0.5';
      btnStop.disabled = false;
      btnStop.style.opacity = '1';
      const dateStr = new Date(state.startTime).toLocaleTimeString();
      statusEl.textContent = `Status: Capturing since ${dateStr}`;
      statusEl.style.color = '#00e676';
    } else {
      btnStart.disabled = false;
      btnStart.style.opacity = '1';
      btnStop.disabled = true;
      btnStop.style.opacity = '0.5';
      statusEl.textContent = 'Status: Idle';
      statusEl.style.color = 'var(--text-muted)';
    }
  }

  btnStart.addEventListener('click', () => {
    const state = {
      isCapturing: true,
      startTime: Date.now()
    };
    chrome.storage.local.set({ captureState: state }, () => {
      updateCaptureUI(state);
    });
  });

  btnStop.addEventListener('click', async () => {
    chrome.storage.local.get(['captureState'], async (res) => {
      const state = res.captureState || { isCapturing: false, startTime: null };
      if (!state.isCapturing || !state.startTime) return;

      const stopTime = Date.now();
      const startTime = state.startTime;

      const newState = { isCapturing: false, startTime: null };
      chrome.storage.local.set({ captureState: newState }, () => {
        updateCaptureUI(newState);
      });

      try {
        const { db, appLogger } = await getUIStore();
        let candles = await getCandles(db, null, null, 100000);
        candles = candles.filter(c => c.timestamp >= startTime && c.timestamp <= stopTime);

        const tfVal = tfFilter ? tfFilter.value : 'both';
        if (tfVal === 'tick') {
          candles = candles.filter(c => c.timeframe === 'tick');
        } else if (tfVal === '1m') {
          candles = candles.filter(c => c.timeframe === '1m');
        }

        if (candles.length === 0) {
          alert('No candles matching timeframe criteria were recorded during the capture window.');
          return;
        }

        const fileContent = appLogger.convertToJSONL(candles);
        const mimeType = 'text/plain;charset=utf-8;';
        
        const startStr = new Date(startTime).toISOString().replace(/[:.]/g, '-');
        const stopStr = new Date(stopTime).toISOString().replace(/[:.]/g, '-');
        const fileName = `candles_capture_${startStr}_to_${stopStr}.jsonl`;

        downloadFile(fileContent, fileName, mimeType);
      } catch (err) {
        alert(`Failed to export captured stream: ${err.message}`);
      }
    });
  });

  btnExtract.addEventListener('click', async () => {
    const val = extractWindow.value;
    let minTimestamp = null;

    if (val !== 'all') {
      const mins = parseInt(val, 10);
      minTimestamp = Date.now() - (mins * 60 * 1000);
    }

    try {
      const { db, appLogger } = await getUIStore();
      let candles = await getCandles(db, null, null, 100000);

      if (minTimestamp !== null) {
        candles = candles.filter(c => c.timestamp >= minTimestamp);
      }

      const tfVal = tfFilter ? tfFilter.value : 'both';
      if (tfVal === 'tick') {
        candles = candles.filter(c => c.timeframe === 'tick');
      } else if (tfVal === '1m') {
        candles = candles.filter(c => c.timeframe === '1m');
      }

      if (candles.length === 0) {
        alert('No candles in database matching timeframe criteria for the selected time window.');
        return;
      }

      const fileContent = appLogger.convertToJSONL(candles);
      const mimeType = 'text/plain;charset=utf-8;';
      
      const timeLabel = val === 'all' ? 'all' : `${val}m`;
      const fileName = `candles_extract_${timeLabel}_${Date.now()}.jsonl`;

      downloadFile(fileContent, fileName, mimeType);
    } catch (err) {
      alert(`Extraction failed: ${err.message}`);
    }
  });
}

export async function triggerExport(format) {
  try {
    const { db, appLogger } = await getUIStore();
    let candles = await getCandles(db, null, null, 100000);

    const tfFilter = document.getElementById('extract-tf-filter');
    const tfVal = tfFilter ? tfFilter.value : 'both';
    if (tfVal === 'tick') {
      candles = candles.filter(c => c.timeframe === 'tick');
    } else if (tfVal === '1m') {
      candles = candles.filter(c => c.timeframe === '1m');
    }

    if (candles.length === 0) {
      alert('No candles in database matching timeframe criteria to export.');
      return;
    }

    let fileContent = '';
    let mimeType = '';
    let fileName = '';

    if (format === 'json') {
      fileContent = JSON.stringify(candles, null, 2);
      mimeType = 'application/json;charset=utf-8;';
      fileName = `quotex_candles_${Date.now()}.json`;
    } else if (format === 'csv') {
      const header = 'timestamp,datetime,symbol,open,high,low,close,volume\n';
      const rows = candles.map(c => {
        const dt = new Date(c.timestamp).toISOString();
        return `${c.timestamp},${dt},${c.symbol},${c.open},${c.high},${c.low},${c.close},${c.volume || 0}`;
      }).join('\n');
      fileContent = header + rows;
      mimeType = 'text/csv;charset=utf-8;';
      fileName = `quotex_candles_${Date.now()}.csv`;
    } else {
      fileContent = appLogger.convertToJSONL(candles);
      mimeType = 'text/plain;charset=utf-8;';
      fileName = `quotex_candles_${Date.now()}.jsonl`;
    }

    downloadFile(fileContent, fileName, mimeType);
  } catch (err) {
    alert(`Export failed: ${err.message}`);
  }
}

export async function exportRecentCandles(minutes) {
  try {
    const { db } = await getUIStore();
    let candles = await getCandles(db, null, null, 100000);
    
    // Filter strictly for 1m completed candles
    candles = candles.filter(c => c.timeframe === '1m');
    
    if (candles.length === 0) {
      alert('No 1-minute candles found in the database yet. Wait for a minute to close.');
      return;
    }
    
    // Sort chronologically and extract the trailing N elements
    candles.sort((a, b) => a.timestamp - b.timestamp);
    const recentCandles = candles.slice(-minutes);
    
    const header = 'timestamp,datetime,symbol,open,high,low,close,volume\n';
    const rows = recentCandles.map(c => {
      const dt = new Date(c.timestamp).toISOString();
      return `${c.timestamp},${dt},${c.symbol},${c.open},${c.high},${c.low},${c.close},${c.volume || 0}`;
    }).join('\n');
    
    const fileContent = header + rows;
    const mimeType = 'text/csv;charset=utf-8;';
    const fileName = `recent_${minutes}m_ohlc_${Date.now()}.csv`;
    
    downloadFile(fileContent, fileName, mimeType);
  } catch (err) {
    alert(`Failed to export recent candles: ${err.message}`);
  }
}

function downloadFile(content, fileName, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', fileName);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
