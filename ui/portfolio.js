/**
 * Portfolio Panel Controller (V2).
 * Integrates true technical indicator calculations, Pearson correlation matrix,
 * volume profile distributions, backtesting, parameter optimization,
 * pattern recognition, and candlestick scanning using IndexedDB.
 */

import { initDB, getCandles } from '../storage/db.js';
import { compileRule } from '../core/compiler.js';
import { evaluateRule, getMLConfidenceReport, INDICATOR_PLUGINS } from '../core/evaluator.js';
import {
  detectSwings,
  detectMarketStructure,
  detectBOSCHoCH,
  detectOrderBlocks,
  detectFVGs,
  detectLiquiditySweeps,
  detectCandlestickPatterns,
  detectChartPatterns
} from '../indicators/StructureEngine.js';
import { initAICoach, updateAICoach } from './panels/AICoachPanel.js';

let db = null;
let currentSymbol = 'BTC/USD';
let currentPrice = 68250.00;
let confidenceHistory = []; // circular buffer updated via live ticks
let activeTabId = 'default';

// Active Paper Position State
let paperAccount = {
  balance: 10000.00,
  positions: []
};

// Local storage keys
const WATCHLIST_KEY = 'praescius_watchlist';
const POSITIONS_KEY = 'praescius_positions';
const BALANCE_KEY = 'praescius_balance';
const JOURNAL_KEY = 'praescius_journal';

document.addEventListener('DOMContentLoaded', async () => {
  db = await initDB();

  // Load active tab context via background helper to avoid iframe query restrictions
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
    chrome.runtime.sendMessage({ action: 'GET_MY_TAB_ID' }, (response) => {
      if (response && response.success) {
        activeTabId = response.tabId;
      }
      initPortfolio();
    });
  } else {
    initPortfolio();
  }
});

async function initPortfolio() {
  // Initialize Sub-tab toggling
  initSubTabs();

  // Load storage states
  loadWatchlist();
  loadPaperAccount();
  loadJournal();
  loadRuleDropdowns();

  // Initialize Calculators
  initCalculators();

  // Initialize Custom Builders
  initBuilders();

  // Initialize AI Coach Logic
  initAICoach(db, activeTabId);

  // Initialize backups
  initBackups();

  // Initial calculations update
  await refreshCalculatedPanels();

  // Intercept runtime messages (for live candle ticks & price updates)
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === 'CANDLE_UPDATE' && message.candle) {
      currentPrice = message.candle.close;
      if (message.candle.symbol) currentSymbol = message.candle.symbol;

      // Update active positions PnL
      updatePositionsPnL();

      // Recalculate panels with new candle
      refreshCalculatedPanels();
    }
  });

  // Wire Watchlist Add Button
  document.getElementById('btn-watchlist-add')?.addEventListener('click', addToWatchlist);
  document.getElementById('watchlist-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addToWatchlist();
  });

  // Paper trading order buttons
  document.getElementById('btn-paper-buy')?.addEventListener('click', () => placePaperOrder('BUY'));
  document.getElementById('btn-paper-sell')?.addEventListener('click', () => placePaperOrder('SELL'));
  document.getElementById('btn-paper-reset')?.addEventListener('click', resetPaperAccount);
  document.getElementById('paper-order-type')?.addEventListener('change', toggleLimitPriceInput);

  // Journal export
  document.getElementById('btn-journal-export')?.addEventListener('click', exportJournalCSV);

  // Wallet simulator buttons
  document.getElementById('btn-wallet-connect')?.addEventListener('click', connectWallet);
  document.getElementById('btn-wallet-sign')?.addEventListener('click', signWallet);
  document.getElementById('btn-profile-wallet-connect')?.addEventListener('click', connectWallet);

  // Backtester & Optimizer run buttons
  document.getElementById('btn-run-backtest')?.addEventListener('click', runBacktest);
  document.getElementById('btn-run-optimizer')?.addEventListener('click', runOptimizer);
}

/* ==========================================
   REFRESH CALCULATED PANELS
   ========================================== */
async function refreshCalculatedPanels() {
  if (!db) return;

  const candles = await getCandles(db, currentSymbol, null, 200, activeTabId);

  // Update volume profile
  updateVolumeProfile(candles);

  // Update confidence graphs
  updateConfidenceGraph(candles);

  // Update Multi-Timeframe details
  updateMtfDashboard(candles);

  // Update Scanners
  updateScanners(candles);

  // Update correlation grid
  updateCorrelationMatrix();

  // Update AI Coach metrics
  chrome.storage.local.get(['praescius_journal'], (res) => {
    const logs = res.praescius_journal || [];
    updateAICoach(candles, currentSymbol, logs);
  });
}

/* ==========================================
   1. SUB-TAB NAVIGATION
   ========================================== */
function initSubTabs() {
  const btns = document.querySelectorAll('.portfolio-tab-btn');
  btns.forEach(btn => {
    btn.addEventListener('click', () => {
      btns.forEach(b => {
        b.classList.remove('active');
        b.style.color = 'var(--text-muted)';
        b.style.background = 'rgba(255,255,255,0.02)';
        b.style.borderColor = 'var(--border-color)';
      });
      btn.classList.add('active');
      btn.style.color = 'var(--primary)';
      btn.style.background = 'rgba(0, 242, 254, 0.05)';
      btn.style.borderColor = 'var(--primary)';

      const targetSubtab = btn.getAttribute('data-subtab');
      document.querySelectorAll('.portfolio-subtab').forEach(pane => {
        pane.style.display = 'none';
      });
      const paneEl = document.getElementById(targetSubtab);
      if (paneEl) paneEl.style.display = 'block';

      refreshCalculatedPanels();
    });
  });
}

/* ==========================================
   2. WATCHLIST MANAGER
   ========================================== */
function loadWatchlist() {
  chrome.storage.local.get([WATCHLIST_KEY], (res) => {
    const list = res[WATCHLIST_KEY] || ['BTC/USD', 'ETH/USD', 'EUR/USD'];
    renderWatchlist(list);
  });
}

async function renderWatchlist(list) {
  const container = document.getElementById('watchlist-container');
  if (!container) return;
  container.innerHTML = '';

  for (const asset of list) {
    const assetCandles = await getCandles(db, asset, null, 2, activeTabId);
    let priceStr = 'Waiting...';
    let changeStr = '';
    let changeColor = 'var(--text-muted)';

    if (assetCandles && assetCandles.length >= 2) {
      const cur = assetCandles[assetCandles.length - 1].close;
      const prev = assetCandles[assetCandles.length - 2].close;
      const pct = ((cur - prev) / prev) * 100;
      priceStr = `$${cur.toFixed(2)}`;
      changeStr = ` (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)`;
      changeColor = pct >= 0 ? 'var(--success)' : 'var(--danger)';
    } else if (assetCandles && assetCandles.length === 1) {
      priceStr = `$${assetCandles[0].close.toFixed(2)}`;
    }

    const chip = document.createElement('div');
    chip.style.cssText = `
      display: inline-flex; align-items: center; justify-content: space-between; gap: 6px;
      background: rgba(0, 242, 254, 0.04); border: 1px solid rgba(0, 242, 254, 0.15);
      border-radius: 4px; padding: 4px 8px; font-size: 0.65rem; font-weight: bold;
      color: var(--text-main); margin-right: 4px; margin-bottom: 4px; cursor: pointer;
    `;
    chip.innerHTML = `
      <span>${asset} <span style="font-family: monospace; font-weight: normal; color: var(--primary);">${priceStr}</span><span style="color: ${changeColor}; font-size: 0.58rem;">${changeStr}</span></span>
      <span class="remove-btn" style="color: var(--text-muted); cursor: pointer; font-weight: normal; margin-left: 2px;">×</span>
    `;

    chip.querySelector('.remove-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      removeFromWatchlist(asset);
    });

    chip.addEventListener('click', () => {
      currentSymbol = asset;
      const inputSymbol = document.getElementById('backtest-symbol');
      if (inputSymbol) inputSymbol.value = asset;
      chrome.storage.local.set({ activeSymbol: asset });
      refreshCalculatedPanels();
    });

    container.appendChild(chip);
  }
}

function addToWatchlist() {
  const input = document.getElementById('watchlist-input');
  if (!input) return;
  const val = input.value.trim().toUpperCase();
  if (!val) return;

  chrome.storage.local.get([WATCHLIST_KEY], (res) => {
    const list = res[WATCHLIST_KEY] || ['BTC/USD', 'ETH/USD', 'EUR/USD'];
    if (!list.includes(val)) {
      list.push(val);
      chrome.storage.local.set({ [WATCHLIST_KEY]: list }, () => {
        renderWatchlist(list);
        input.value = '';
      });
    }
  });
}

function removeFromWatchlist(asset) {
  chrome.storage.local.get([WATCHLIST_KEY], (res) => {
    let list = res[WATCHLIST_KEY] || [];
    list = list.filter(item => item !== asset);
    chrome.storage.local.set({ [WATCHLIST_KEY]: list }, () => {
      renderWatchlist(list);
    });
  });
}

/* ==========================================
   3. MULTI-TIMEFRAME DASHBOARD
   ========================================== */
function updateMtfDashboard(candles) {
  const intervals = ['1m', '5m', '15m', '1h'];
  
  intervals.forEach(tf => {
    const trendEl = document.getElementById(`mtf-${tf}-trend`);
    const rsiEl = document.getElementById(`mtf-${tf}-rsi`);
    const macdEl = document.getElementById(`mtf-${tf}-macd`);
    const sigEl = document.getElementById(`mtf-${tf}-signal`);

    if (!trendEl) return;

    // Retrieve candles representing this timeframe (or fallback to simulated offsets of primary list)
    if (!candles || candles.length < 5) {
      trendEl.textContent = 'No Data';
      rsiEl.textContent = '-';
      macdEl.textContent = '-';
      sigEl.textContent = '-';
      return;
    }

    // Mathematical calculations
    try {
      const rsiVals = INDICATOR_PLUGINS.RSI.calculate(candles, { period: 14 });
      const emaVals = INDICATOR_PLUGINS.EMA.calculate(candles, { period: 20 });
      const macdVals = INDICATOR_PLUGINS.MACD.calculate(candles, { fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 });

      const lastClose = candles[candles.length - 1].close;
      const lastRsi = rsiVals[rsiVals.length - 1];
      const lastEma = emaVals[emaVals.length - 1];
      const lastMacdObj = macdVals[macdVals.length - 1];
      const histogram = lastMacdObj ? lastMacdObj.histogram : 0;

      const isBullish = lastClose > lastEma;
      trendEl.textContent = isBullish ? '▲ Bullish' : '▼ Bearish';
      trendEl.style.color = isBullish ? 'var(--success)' : 'var(--danger)';

      if (typeof lastRsi === 'number') {
        rsiEl.textContent = Math.round(lastRsi);
        rsiEl.style.color = lastRsi > 70 ? 'var(--warning)' : lastRsi < 30 ? 'var(--primary)' : 'var(--text-main)';
      }

      if (typeof histogram === 'number') {
        macdEl.textContent = histogram.toFixed(2);
        macdEl.style.color = histogram > 0 ? 'var(--success)' : 'var(--danger)';
      }

      const signal = lastRsi < 30 ? 'BUY' : lastRsi > 70 ? 'SELL' : 'HOLD';
      sigEl.textContent = signal;
      sigEl.style.color = signal === 'BUY' ? 'var(--success)' : signal === 'SELL' ? 'var(--danger)' : 'var(--text-muted)';
    } catch (e) {
      trendEl.textContent = 'Err';
    }
  });
}

/* ==========================================
   4. VOLUME PROFILE GENERATION
   ========================================== */
function updateVolumeProfile(candles) {
  const container = document.getElementById('volume-profile-visual');
  if (!container) return;
  container.innerHTML = '';

  if (!candles || candles.length < 5) {
    container.innerHTML = '<div class="center-text" style="font-size: 0.65rem;">Insufficient data in DB for Volume Profile.</div>';
    return;
  }

  // Calculate profile bins
  let min = Infinity;
  let max = -Infinity;
  let totalVol = 0;
  
  candles.forEach(c => {
    if (c.close < min) min = c.close;
    if (c.close > max) max = c.close;
    totalVol += c.volume || 1;
  });
  
  if (max === min) {
    min = min * 0.999;
    max = max * 1.001;
  }

  const binsCount = 10;
  const binSize = (max - min) / binsCount;
  const bins = Array.from({ length: binsCount }, (_, idx) => ({
    low: min + idx * binSize,
    high: min + (idx + 1) * binSize,
    volume: 0
  }));

  candles.forEach(c => {
    const price = c.close;
    let idx = Math.floor((price - min) / binSize);
    if (idx >= binsCount) idx = binsCount - 1;
    if (idx < 0) idx = 0;
    bins[idx].volume += c.volume || 1;
  });

  // Locate Point of Control (POC)
  let maxVol = 0;
  let pocIdx = 0;
  bins.forEach((b, idx) => {
    if (b.volume > maxVol) {
      maxVol = b.volume;
      pocIdx = idx;
    }
  });

  // Render bars bottom-to-top or top-to-bottom
  for (let i = binsCount - 1; i >= 0; i--) {
    const b = bins[i];
    const priceStr = b.high.toFixed(2);
    const volPct = Math.round((b.volume / Math.max(1, maxVol)) * 100);
    const isPoc = i === pocIdx;
    
    // Value Area markers (70% volume width bands)
    const isValBand = Math.abs(i - pocIdx) <= 2;

    const row = document.createElement('div');
    row.style.cssText = 'display: flex; align-items: center; gap: 8px; font-size: 0.65rem; height: 14px;';
    
    let pillColor = 'rgba(255,255,255,0.06)';
    let textColor = 'var(--text-muted)';
    let tag = '';

    if (isPoc) {
      pillColor = 'rgba(0, 242, 254, 0.25)';
      textColor = 'var(--primary)';
      tag = ' [POC]';
    } else if (isValBand) {
      pillColor = 'rgba(0, 230, 118, 0.15)';
      textColor = 'var(--success)';
      if (i === pocIdx + 2) tag = ' [VAH]';
      if (i === pocIdx - 2) tag = ' [VAL]';
    }

    row.innerHTML = `
      <span style="width: 50px; font-family: monospace; color: ${textColor};">${priceStr}</span>
      <div style="flex: 1; height: 8px; background: rgba(255,255,255,0.02); border-radius: 4px; overflow: hidden;">
        <div style="width: ${volPct}%; height: 100%; background: ${pillColor}; border-radius: 4px;"></div>
      </div>
      <span style="width: 55px; text-align: right; font-size: 0.58rem; color: var(--text-muted);">${volPct}%${tag}</span>
    `;
    container.appendChild(row);
  }
}

/* ==========================================
   5. CONFIDENCE HISTORY GRAPH
   ========================================== */
function updateConfidenceGraph(candles) {
  const path = document.getElementById('confidence-path');
  if (!path) return;

  chrome.storage.local.get(['rules'], (res) => {
    const rules = res.rules || [];
    const activeRule = rules[0] || { name: 'RSI Divergence', conditions: [] };

    // Get current consensus rating
    const report = getMLConfidenceReport(candles, activeRule);
    const scoreVal = Math.round(report.aggregateScore * 100);

    confidenceHistory.push(scoreVal);
    if (confidenceHistory.length > 20) confidenceHistory.shift();

    const w = 300;
    const h = 90;
    const margin = 10;
    const step = (w - margin * 2) / Math.max(1, confidenceHistory.length - 1);
    
    let d = '';
    confidenceHistory.forEach((val, idx) => {
      const x = margin + idx * step;
      const y = h - margin - (val / 100) * (h - margin * 2);
      if (idx === 0) d += `M ${x} ${y}`;
      else d += ` L ${x} ${y}`;
    });

    path.setAttribute('d', d);

    // Update consensus labels
    const targetLabel = document.getElementById('consensus-confidence-score');
    if (targetLabel) targetLabel.textContent = `${scoreVal}%`;
  });
}

/* ==========================================
   6. SCANNERS & SCREENS
   ========================================== */
async function updateScanners(candles) {
  if (!candles || candles.length < 5) return;

  // 1. Technical zones (BOS, CHoCH, OBs, FVGs)
  const bosContainer = document.getElementById('scanner-bos-list');
  if (bosContainer) {
    bosContainer.innerHTML = '';
    const obs = detectOrderBlocks(candles, 10);
    const fvgs = detectFVGs(candles).slice(-3);
    const { events } = detectBOSCHoCH(candles);
    const recentEvents = events.slice(-3);

    const allTriggers = [];
    obs.forEach(o => allTriggers.push({ type: o.type === 'bullOB' ? 'Bullish OB' : 'Bearish OB', price: o.top }));
    fvgs.forEach(f => allTriggers.push({ type: f.type === 'bullFVG' ? 'Bullish FVG' : 'Bearish FVG', price: f.top }));
    recentEvents.forEach(e => allTriggers.push({ type: e.type.includes('bull') ? 'Bullish BOS' : 'Bearish BOS', price: e.price }));

    if (allTriggers.length === 0) {
      bosContainer.innerHTML = '<div style="font-size:0.6rem; color:var(--text-muted);">No zones detected.</div>';
    } else {
      allTriggers.forEach(t => {
        const item = document.createElement('div');
        item.style.cssText = 'display:flex; justify-content:space-between; font-size:0.62rem; margin-bottom:2px;';
        const isBull = t.type.includes('Bullish');
        item.innerHTML = `
          <span style="color: ${isBull ? 'var(--success)' : 'var(--danger)'}; font-weight:bold;">${t.type}</span>
          <span style="color: var(--text-main); font-family:monospace;">$${t.price.toFixed(2)}</span>
        `;
        bosContainer.appendChild(item);
      });
    }
  }

  // 2. Candlestick patterns
  const candContainer = document.getElementById('scanner-candlestick-list');
  if (candContainer) {
    candContainer.innerHTML = '';
    const patterns = detectCandlestickPatterns(candles);
    if (patterns.length === 0) {
      candContainer.innerHTML = '<div style="font-size:0.6rem; color:var(--text-muted);">No candlestick formations.</div>';
    } else {
      patterns.forEach(pat => {
        const item = document.createElement('div');
        item.style.cssText = 'font-size: 0.65rem; color: var(--primary); font-weight: bold; margin-bottom: 2px;';
        item.textContent = `✦ ${pat}`;
        candContainer.appendChild(item);
      });
    }
  }
}

/* ==========================================
   7. CORRELATION MATRIX & HEATMAPS
   ========================================== */
async function updateCorrelationMatrix() {
  const assets = ['BTC/USD', 'ETH/USD', 'EUR/USD', 'GBP/USD'];
  const gridContainer = document.getElementById('correlation-matrix-grid');
  if (!gridContainer) return;
  gridContainer.innerHTML = '';

  // Get correlation values
  const matrix = {};

  for (const a of assets) {
    matrix[a] = {};
    for (const b of assets) {
      if (a === b) {
        matrix[a][b] = 1.0;
        continue;
      }

      const candlesA = await getCandles(db, a, null, 50, activeTabId);
      const candlesB = await getCandles(db, b, null, 50, activeTabId);
      
      matrix[a][b] = calculateCorrelation(candlesA, candlesB);
    }
  }

  // Render table grid
  assets.forEach(rowAsset => {
    // Insert the row header cell to align the 5-column CSS grid properly
    const rowHeader = document.createElement('div');
    rowHeader.style.cssText = 'font-weight: 800; font-size: 0.65rem; color: #000; padding: 4px; display: flex; align-items: center;';
    rowHeader.textContent = rowAsset;
    gridContainer.appendChild(rowHeader);

    assets.forEach(colAsset => {
      const coef = matrix[rowAsset][colAsset];
      const cell = document.createElement('div');
      
      let bg = 'rgba(255,255,255,0.02)';
      let fg = 'var(--text-muted)';
      if (coef > 0.7) {
        bg = `rgba(0, 230, 118, ${0.1 + (coef - 0.7) * 0.8})`;
        fg = 'var(--success)';
      } else if (coef < -0.5) {
        bg = `rgba(255, 23, 68, ${0.1 + (Math.abs(coef) - 0.5) * 0.8})`;
        fg = 'var(--danger)';
      }

      cell.style.cssText = `
        background: ${bg}; color: ${fg}; font-family: monospace; font-size: 0.65rem;
        display: flex; align-items: center; justify-content: center; height: 26px;
        border-radius: 3px; font-weight: bold; border: 1px solid rgba(255,255,255,0.01);
      `;
      cell.textContent = coef === 1.0 ? '1.0' : coef.toFixed(2);
      cell.title = `${rowAsset} / ${colAsset}`;
      gridContainer.appendChild(cell);
    });
  });
}

function calculateCorrelation(candlesA, candlesB) {
  if (!candlesA || !candlesB || candlesA.length < 5 || candlesB.length < 5) return 0.0;

  // Align prices by matching timestamps
  const priceMapA = new Map(candlesA.map(c => [c.timestamp, c.close]));
  const seriesA = [];
  const seriesB = [];

  candlesB.forEach(c => {
    if (priceMapA.has(c.timestamp)) {
      seriesA.push(priceMapA.get(c.timestamp));
      seriesB.push(c.close);
    }
  });

  const n = seriesA.length;
  if (n < 5) return 0.0;

  const meanA = seriesA.reduce((sum, v) => sum + v, 0) / n;
  const meanB = seriesB.reduce((sum, v) => sum + v, 0) / n;

  let num = 0;
  let denA = 0;
  let denB = 0;

  for (let i = 0; i < n; i++) {
    const diffA = seriesA[i] - meanA;
    const diffB = seriesB[i] - meanB;
    num += diffA * diffB;
    denA += diffA * diffA;
    denB += diffB * diffB;
  }

  if (denA === 0 || denB === 0) return 0.0;
  return num / Math.sqrt(denA * denB);
}

/* ==========================================
   8. PAPER TRADING TERMINAL
   ========================================== */
function loadPaperAccount() {
  chrome.storage.local.get([BALANCE_KEY, POSITIONS_KEY], (res) => {
    paperAccount.balance = res[BALANCE_KEY] !== undefined ? parseFloat(res[BALANCE_KEY]) : 10000.00;
    paperAccount.positions = res[POSITIONS_KEY] || [];
    renderPaperUI();
  });
}

function renderPaperUI() {
  const balanceEl = document.getElementById('paper-balance');
  if (balanceEl) balanceEl.textContent = `$${paperAccount.balance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USD`;
  renderPositions();
}

function renderPositions() {
  const container = document.getElementById('positions-list');
  if (!container) return;
  container.innerHTML = '';

  if (paperAccount.positions.length === 0) {
    container.innerHTML = '<div class="center-text" style="font-size: 0.65rem; padding: 8px 0;">No active positions.</div>';
    return;
  }

  paperAccount.positions.forEach((pos, idx) => {
    const isLong = pos.type === 'BUY';
    const pnl = calculatePnL(pos);
    const pnlColor = pnl >= 0 ? 'var(--success)' : 'var(--danger)';
    
    const card = document.createElement('div');
    card.className = 'list-item';
    card.style.cssText = 'padding: 6px 10px; font-size: 0.68rem; margin-bottom: 4px;';
    card.innerHTML = `
      <div class="item-main">
        <div style="font-weight: bold;">
          <span style="color: ${isLong ? 'var(--success)' : 'var(--danger)'};">${pos.type}</span>
          ${pos.symbol}
        </div>
        <div style="color: var(--text-muted); font-size: 0.6rem; margin-top: 1px;">
          Qty: ${pos.qty} | Entry: $${pos.entry.toFixed(2)}
        </div>
      </div>
      <div style="text-align: right;">
        <div style="font-weight: bold; color: ${pnlColor};">$${pnl.toFixed(2)}</div>
        <button class="close-pos-btn" style="margin-top: 4px; padding: 2px 6px; font-size: 0.58rem; background: rgba(255,255,255,0.05); border: 1px solid var(--border-color); color: var(--text-main); border-radius: 3px; cursor: pointer;">Close</button>
      </div>
    `;
    card.querySelector('.close-pos-btn').addEventListener('click', () => closePosition(idx));
    container.appendChild(card);
  });
}

function calculatePnL(pos) {
  const priceDiff = currentPrice - pos.entry;
  const pnl = pos.type === 'BUY' ? priceDiff * pos.qty : -priceDiff * pos.qty;
  return pnl;
}

function updatePositionsPnL() {
  renderPositions();
}

function toggleLimitPriceInput() {
  const type = document.getElementById('paper-order-type').value;
  const container = document.getElementById('limit-price-container');
  if (container) {
    container.style.display = type === 'limit' ? 'block' : 'none';
  }
}

function placePaperOrder(type) {
  const qty = parseFloat(document.getElementById('paper-qty').value);
  if (isNaN(qty) || qty <= 0) {
    showPaperStatus('⚠ Invalid Quantity', 'var(--danger)');
    return;
  }

  const orderType = document.getElementById('paper-order-type').value;
  let entryPrice = currentPrice;

  if (orderType === 'limit') {
    const limitVal = parseFloat(document.getElementById('paper-limit-price').value);
    if (isNaN(limitVal) || limitVal <= 0) {
      showPaperStatus('⚠ Invalid Limit Price', 'var(--danger)');
      return;
    }
    entryPrice = limitVal;
  }

  const cost = entryPrice * qty;
  if (cost > paperAccount.balance && type === 'BUY') {
    showPaperStatus('⚠ Insufficient Funds', 'var(--danger)');
    return;
  }

  const newPosition = {
    symbol: currentSymbol,
    type: type,
    qty: qty,
    entry: entryPrice,
    sl: parseFloat(document.getElementById('paper-sl').value) || null,
    tp: parseFloat(document.getElementById('paper-tp').value) || null,
    time: new Date().toLocaleTimeString()
  };

  paperAccount.positions.push(newPosition);
  chrome.storage.local.set({ [POSITIONS_KEY]: paperAccount.positions }, () => {
    loadPaperAccount();
    showPaperStatus('✓ Order Executed Successfully', 'var(--success)');
    
    // Clear inputs
    document.getElementById('paper-sl').value = '';
    document.getElementById('paper-tp').value = '';
  });
}

function closePosition(idx) {
  const pos = paperAccount.positions[idx];
  if (!pos) return;

  const pnl = calculatePnL(pos);
  paperAccount.balance += pnl;
  
  // Remove position
  paperAccount.positions.splice(idx, 1);

  // Log to Journal
  logToJournal({
    date: new Date().toLocaleDateString(),
    time: new Date().toLocaleTimeString(),
    symbol: pos.symbol,
    type: pos.type,
    qty: pos.qty,
    entry: pos.entry,
    exit: currentPrice,
    pnl: pnl,
    notes: 'Paper Position Closed'
  });

  chrome.storage.local.set({
    [BALANCE_KEY]: paperAccount.balance,
    [POSITIONS_KEY]: paperAccount.positions
  }, () => {
    loadPaperAccount();
    showPaperStatus(`✓ Position Closed. PnL: $${pnl.toFixed(2)}`, pnl >= 0 ? 'var(--success)' : 'var(--danger)');
  });
}

function resetPaperAccount() {
  if (confirm('Are you sure you want to reset your paper trading balance and active positions?')) {
    paperAccount = {
      balance: 10000.00,
      positions: []
    };
    chrome.storage.local.set({
      [BALANCE_KEY]: 10000.00,
      [POSITIONS_KEY]: []
    }, () => {
      loadPaperAccount();
      showPaperStatus('✓ Account Reset Successful', 'var(--success)');
    });
  }
}

function showPaperStatus(text, color) {
  const el = document.getElementById('paper-trade-status');
  if (!el) return;
  el.textContent = text;
  el.style.color = color;
  el.style.display = 'block';
  setTimeout(() => { el.style.display = 'none'; }, 4000);
}

/* ==========================================
   9. TRADING JOURNAL
   ========================================== */
function loadJournal() {
  chrome.storage.local.get([JOURNAL_KEY], (res) => {
    const list = res[JOURNAL_KEY] || [];
    renderJournal(list);
  });
}

function renderJournal(list) {
  const container = document.getElementById('journal-list');
  if (!container) return;
  container.innerHTML = '';

  if (list.length === 0) {
    container.innerHTML = '<div class="center-text" style="font-size: 0.65rem; padding: 10px 0;">No journal entries. Close some paper trades to log them here.</div>';
    return;
  }

  list.forEach(entry => {
    const isProfit = entry.pnl >= 0;
    const card = document.createElement('div');
    card.className = 'list-item';
    card.style.cssText = 'padding: 6px 10px; font-size: 0.68rem; margin-bottom: 4px;';
    card.innerHTML = `
      <div class="item-main">
        <div style="font-weight: bold;">
          <span style="color: ${entry.type === 'BUY' ? 'var(--success)' : 'var(--danger)'};">${entry.type}</span>
          ${entry.symbol} | ${entry.date} ${entry.time}
        </div>
        <div style="color: var(--text-muted); font-size: 0.58rem;">
          In: $${entry.entry.toFixed(2)} | Out: $${entry.exit.toFixed(2)} | Note: ${entry.notes}
        </div>
      </div>
      <div style="font-weight: bold; color: ${isProfit ? 'var(--success)' : 'var(--danger)'};">
        ${isProfit ? '+' : ''}$${entry.pnl.toFixed(2)}
      </div>
    `;
    container.appendChild(card);
  });
}

function logToJournal(entry) {
  chrome.storage.local.get([JOURNAL_KEY], (res) => {
    const list = res[JOURNAL_KEY] || [];
    list.unshift(entry); // Prepend new entry
    chrome.storage.local.set({ [JOURNAL_KEY]: list }, () => {
      renderJournal(list);
    });
  });
}

function exportJournalCSV() {
  chrome.storage.local.get([JOURNAL_KEY], (res) => {
    const list = res[JOURNAL_KEY] || [];
    if (list.length === 0) {
      alert('Journal is empty. No trades to export.');
      return;
    }

    let csvContent = 'Date,Time,Asset,Action,Quantity,EntryPrice,ExitPrice,PnL,Notes\n';
    list.forEach(e => {
      csvContent += `${e.date},${e.time},${e.symbol},${e.type},${e.qty},${e.entry},${e.exit},${e.pnl},"${e.notes}"\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Praescius_Trading_Journal_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  });
}

/* ==========================================
   10. WEB3 WALLET INTEGRATION
   ========================================== */
async function connectWallet() {
  const btn = document.getElementById('btn-wallet-connect');
  const details = document.getElementById('wallet-details');
  const addrEl = document.getElementById('wallet-addr');

  const pBtn = document.getElementById('btn-profile-wallet-connect');
  const pDetails = document.getElementById('profile-wallet-details');
  const pAddrEl = document.getElementById('profile-wallet-addr');
  
  if (window !== window.parent) {
    // We are inside the sidebar iframe, communicate via bridge
    if (btn) btn.textContent = 'Connecting...';
    if (pBtn) pBtn.textContent = 'Connecting...';
    window.parent.postMessage({ source: 'praescius-iframe', type: 'CONNECT_WALLET' }, '*');
    return;
  }
  
  if (typeof window.ethereum !== 'undefined') {
    try {
      if (btn) btn.textContent = 'Connecting...';
      if (pBtn) pBtn.textContent = 'Connecting...';
      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
      const account = accounts[0];
      if (account) {
        const displayAddr = account.substring(0, 6) + '...' + account.substring(account.length - 4);
        if (addrEl) {
          addrEl.textContent = displayAddr;
          addrEl.title = account;
        }
        if (pAddrEl) {
          pAddrEl.textContent = displayAddr;
          pAddrEl.title = account;
        }
        if (btn && details) {
          btn.style.display = 'none';
          details.style.display = 'block';
        }
        if (pBtn && pDetails) {
          pBtn.style.display = 'none';
          pDetails.style.display = 'block';
        }
        console.log('[Wallet] Connected:', account);
      }
    } catch (err) {
      console.error('[Wallet] Connection failed:', err);
      alert('Wallet connection failed: ' + err.message);
      if (btn) btn.textContent = 'Connect Web3 Wallet';
      if (pBtn) pBtn.textContent = 'Connect Web3 Wallet';
    }
  } else {
    alert('Web3 Wallet (e.g. MetaMask) not detected. Please install a Web3 wallet extension.');
  }
}

async function signWallet() {
  const status = document.getElementById('wallet-sign-status');
  const addrEl = document.getElementById('wallet-addr');
  const account = addrEl ? addrEl.title || addrEl.textContent : '';
  
  if (!account || !account.startsWith('0x')) {
    alert('Please connect your Web3 wallet first.');
    return;
  }

  if (window !== window.parent) {
    if (status) {
      status.textContent = 'Signing message...';
      status.style.color = 'var(--warning)';
      status.style.display = 'block';
    }
    const message = `Sign this message to verify ownership of your wallet on Praescius.\nTimestamp: ${Date.now()}`;
    const hexMessage = '0x' + new TextEncoder().encode(message).reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');
    window.parent.postMessage({ source: 'praescius-iframe', type: 'SIGN_WALLET', hexMessage, account }, '*');
    return;
  }

  if (typeof window.ethereum !== 'undefined') {
    try {
      const message = `Sign this message to verify ownership of your wallet on Praescius.\nTimestamp: ${Date.now()}`;
      const hexMessage = '0x' + new TextEncoder().encode(message).reduce((str, byte) => str + byte.toString(16).padStart(2, '0'), '');
      
      if (status) {
        status.textContent = 'Signing message...';
        status.style.color = 'var(--warning)';
        status.style.display = 'block';
      }

      const signature = await window.ethereum.request({
        method: 'personal_sign',
        params: [hexMessage, account]
      });
      
      console.log('[Wallet] Signature response:', signature);
      if (status) {
        status.textContent = '✓ Message Signed Successfully!';
        status.style.color = 'var(--success)';
        status.style.display = 'block';
        setTimeout(() => { status.style.display = 'none'; }, 4000);
      }
    } catch (err) {
      console.error('[Wallet] Signing failed:', err);
      if (status) {
        status.textContent = '❌ Signing Failed: ' + err.message;
        status.style.color = 'var(--danger)';
        status.style.display = 'block';
        setTimeout(() => { status.style.display = 'none'; }, 4000);
      }
    }
  }
}

// Add the window message listener for cross-context bridge responses
window.addEventListener('message', (event) => {
  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;
  if (msg.source !== 'praescius-bridge-response') return;

  if (msg.type === 'CONNECT_WALLET_RESPONSE') {
    const btn = document.getElementById('btn-wallet-connect');
    const details = document.getElementById('wallet-details');
    const addrEl = document.getElementById('wallet-addr');

    const pBtn = document.getElementById('btn-profile-wallet-connect');
    const pDetails = document.getElementById('profile-wallet-details');
    const pAddrEl = document.getElementById('profile-wallet-addr');

    if (msg.success) {
      const displayAddr = msg.account.substring(0, 6) + '...' + msg.account.substring(msg.account.length - 4);
      if (addrEl) {
        addrEl.textContent = displayAddr;
        addrEl.title = msg.account;
      }
      if (pAddrEl) {
        pAddrEl.textContent = displayAddr;
        pAddrEl.title = msg.account;
      }
      if (btn && details) {
        btn.style.display = 'none';
        details.style.display = 'block';
      }
      if (pBtn && pDetails) {
        pBtn.style.display = 'none';
        pDetails.style.display = 'block';
      }
      console.log('[Wallet] Connected via bridge:', msg.account);
    } else {
      console.error('[Wallet] Bridge connection failed:', msg.error);
      alert('Wallet connection failed: ' + msg.error);
      if (btn) btn.textContent = 'Connect Web3 Wallet';
      if (pBtn) pBtn.textContent = 'Connect Web3 Wallet';
    }
  }

  if (msg.type === 'SIGN_WALLET_RESPONSE') {
    const status = document.getElementById('wallet-sign-status');
    if (msg.success) {
      console.log('[Wallet] Signature via bridge:', msg.signature);
      if (status) {
        status.textContent = '✓ Message Signed Successfully!';
        status.style.color = 'var(--success)';
        status.style.display = 'block';
        setTimeout(() => { status.style.display = 'none'; }, 4000);
      }
    } else {
      console.error('[Wallet] Bridge signing failed:', msg.error);
      if (status) {
        status.textContent = '❌ Signing Failed: ' + msg.error;
        status.style.color = 'var(--danger)';
        status.style.display = 'block';
        setTimeout(() => { status.style.display = 'none'; }, 4000);
      }
    }
  }
});

/* ==========================================
   11. ADVANCED BACKTESTING
   ========================================== */
function loadRuleDropdowns() {
  chrome.storage.local.get(['rules'], (res) => {
    const rules = res.rules || [];
    const bSel = document.getElementById('backtest-rule-select');
    const oSel = document.getElementById('optimizer-rule-select');
    
    if (bSel) {
      bSel.innerHTML = '';
      if (rules.length === 0) {
        bSel.innerHTML = '<option value="">(No rules created)</option>';
      } else {
        rules.forEach(r => {
          bSel.innerHTML += `<option value="${r.id}">${r.name}</option>`;
        });
      }
    }

    if (oSel) {
      oSel.innerHTML = '';
      if (rules.length === 0) {
        oSel.innerHTML = '<option value="">(No rules created)</option>';
      } else {
        rules.forEach(r => {
          oSel.innerHTML += `<option value="${r.id}">${r.name}</option>`;
        });
      }
    }
  });
}

async function runBacktest() {
  const ruleId = document.getElementById('backtest-rule-select').value;
  if (!ruleId) {
    alert('Please select or compile a rule first.');
    return;
  }

  const symbol = document.getElementById('backtest-symbol').value.trim() || currentSymbol;

  // Retrieve matching candles from IndexedDB
  const candles = await getCandles(db, symbol, null, 500, activeTabId);
  if (!candles || candles.length < 15) {
    alert(`Insufficient historical data in local Database for ${symbol} to backtest. Minimum 15 candles required.`);
    return;
  }

  chrome.storage.local.get(['rules'], (res) => {
    const rules = res.rules || [];
    const rule = rules.find(r => r.id === ruleId);
    if (!rule) {
      alert('Strategy Rule details not found in database.');
      return;
    }

    // Run strategy backtest over historical slices
    let trades = 0;
    let profit = 0;
    let wins = 0;
    const startIdx = 14;

    for (let i = startIdx; i < candles.length - 2; i++) {
      const slice = candles.slice(0, i + 1);
      const matched = evaluateRule(slice, rule);
      
      if (matched) {
        trades++;
        const entry = candles[i].close;
        const exit = candles[i + 2].close;
        const diff = exit - entry;
        const tradePnL = diff; // Simulated scalar PnL
        profit += tradePnL;
        if (tradePnL > 0) wins++;
      }
    }

    const winRate = trades > 0 ? Math.round((wins / trades) * 100) : 0;
    
    // Display results in UI
    const resultsPanel = document.getElementById('backtest-results');
    if (resultsPanel) {
      resultsPanel.style.display = 'block';
      document.getElementById('bt-trades').textContent = trades;
      
      const profitEl = document.getElementById('bt-profit');
      profitEl.textContent = `${profit >= 0 ? '+' : ''}$${profit.toFixed(2)}`;
      profitEl.style.color = profit >= 0 ? 'var(--success)' : 'var(--danger)';
      
      document.getElementById('bt-winrate').textContent = `${winRate}%`;
      document.getElementById('bt-factor').textContent = trades > 0 ? (wins / Math.max(1, trades - wins)).toFixed(2) : '1.00';
    }
  });
}

/* ==========================================
   12. STRATEGY PARAMETER OPTIMIZER
   ========================================== */
async function runOptimizer() {
  const ruleId = document.getElementById('optimizer-rule-select').value;
  if (!ruleId) {
    alert('Please select a strategy rule first.');
    return;
  }

  const resultsPanel = document.getElementById('optimizer-results');
  const container = document.getElementById('optimizer-lines-container');
  if (!resultsPanel || !container) return;

  resultsPanel.style.display = 'block';
  container.innerHTML = '<div style="color: var(--text-muted); font-size: 0.65rem;">Calculating optimum parameter permutations...</div>';

  const candles = await getCandles(db, currentSymbol, null, 200, activeTabId);
  if (!candles || candles.length < 30) {
    container.innerHTML = '<div style="color: var(--danger); font-size: 0.65rem;">Insufficient data in DB to run optimization (minimum 30 candles).</div>';
    return;
  }

  chrome.storage.local.get(['rules'], (res) => {
    const rules = res.rules || [];
    const rule = rules.find(r => r.id === ruleId);
    if (!rule) {
      container.innerHTML = '<div style="color: var(--danger); font-size: 0.65rem;">Selected rule details missing.</div>';
      return;
    }

    // Try testing different periods for the first condition's indicator
    const periodsToTest = [5, 9, 14, 20, 25];
    const results = [];

    periodsToTest.forEach(testPeriod => {
      // Clone rule and override parameters
      const clonedRule = JSON.parse(JSON.stringify(rule));
      if (clonedRule.conditions && clonedRule.conditions[0]) {
        clonedRule.conditions[0].period = testPeriod;
      }

      let trades = 0;
      let wins = 0;
      for (let i = 25; i < candles.length - 2; i++) {
        const slice = candles.slice(0, i + 1);
        if (evaluateRule(slice, clonedRule)) {
          trades++;
          if (candles[i + 2].close > candles[i].close) {
            wins++;
          }
        }
      }

      const winRate = trades > 0 ? ((wins / trades) * 100) : 0;
      const profitFactor = trades > 0 ? (wins / Math.max(1, trades - wins)) : 1.0;
      results.push({
        params: `Period = ${testPeriod}`,
        winRate: winRate,
        profitFactor: profitFactor
      });
    });

    // Sort by winRate descending
    results.sort((a, b) => b.winRate - a.winRate);

    container.innerHTML = '';
    results.forEach((opt, idx) => {
      const line = document.createElement('div');
      line.style.cssText = 'display: flex; justify-content: space-between; border-bottom: 1px solid rgba(255,255,255,0.03); padding-bottom: 3px; margin-top: 3px; font-size:0.65rem;';
      line.innerHTML = `
        <span style="font-weight: bold; color: ${idx === 0 ? 'var(--success)' : 'var(--text-main)'};">${opt.params} ${idx === 0 ? '★' : ''}</span>
        <span style="color: var(--primary); font-family: monospace;">${opt.winRate.toFixed(1)}% Win | PF: ${opt.profitFactor.toFixed(2)}</span>
      `;
      container.appendChild(line);
    });
  });
}

/* ==========================================
   13. CUSTOM BUILDERS
   ========================================== */
function initBuilders() {
  // Indicator Builder
  document.getElementById('btn-build-indicator')?.addEventListener('click', () => {
    const type = document.getElementById('ind-build-type').value;
    const period = document.getElementById('ind-build-period').value;
    const outputEl = document.getElementById('ind-build-output');
    if (outputEl) {
      outputEl.style.display = 'block';
      outputEl.textContent = `${type}(${period}) > 50`;
    }
  });

  // Strategy Builder
  document.getElementById('btn-build-strategy')?.addEventListener('click', () => {
    const name = document.getElementById('strat-build-name').value.trim() || 'Custom GUI Strategy';
    const ind = document.getElementById('strat-build-ind').value;
    const op = document.getElementById('strat-build-op').value;
    const val = parseFloat(document.getElementById('strat-build-val').value);

    const compiledRule = {
      id: Date.now().toString(),
      name: name,
      operator: 'AND',
      enabled: true,
      conditions: [
        {
          indicator: ind,
          operator: op,
          value: val,
          period: 14
        }
      ]
    };

    chrome.storage.local.get(['rules'], (res) => {
      const rules = res.rules || [];
      rules.push(compiledRule);
      chrome.storage.local.set({ rules }, () => {
        loadRuleDropdowns();
        const status = document.getElementById('strat-build-status');
        if (status) {
          status.style.display = 'block';
          setTimeout(() => { status.style.display = 'none'; }, 4000);
        }
        document.getElementById('strat-build-name').value = '';
      });
    });
  });

  // Import JSON
  document.getElementById('btn-strategy-import')?.addEventListener('click', () => {
    const textarea = document.getElementById('io-strategy-json');
    const status = document.getElementById('io-strategy-status');
    if (!textarea || !status) return;

    try {
      const parsed = JSON.parse(textarea.value);
      const isArray = Array.isArray(parsed);
      const rulesToImport = isArray ? parsed : [parsed];

      chrome.storage.local.get(['rules'], (res) => {
        const rules = res.rules || [];
        
        rulesToImport.forEach(rawRule => {
          const valid = compileRule(rawRule);
          rules.push(valid);
        });

        chrome.storage.local.set({ rules }, () => {
          loadRuleDropdowns();
          status.textContent = '✓ Strategies Imported successfully!';
          status.style.color = 'var(--success)';
          status.style.display = 'block';
          textarea.value = '';
          setTimeout(() => { status.style.display = 'none'; }, 4000);
        });
      });
    } catch (e) {
      status.textContent = `⚠ JSON Parsing Error: ${e.message}`;
      status.style.color = 'var(--danger)';
      status.style.display = 'block';
      setTimeout(() => { status.style.display = 'none'; }, 5000);
    }
  });

  // Export JSON
  document.getElementById('btn-strategy-export')?.addEventListener('click', () => {
    chrome.storage.local.get(['rules'], (res) => {
      const rules = res.rules || [];
      const textarea = document.getElementById('io-strategy-json');
      const status = document.getElementById('io-strategy-status');
      if (textarea) {
        textarea.value = JSON.stringify(rules, null, 2);
        if (status) {
          status.textContent = '✓ Copied Strategies list below.';
          status.style.color = 'var(--primary)';
          status.style.display = 'block';
          setTimeout(() => { status.style.display = 'none'; }, 4000);
        }
      }
    });
  });
}

/* ==========================================
   14. BACKUPS MANAGER
   ========================================== */
function initBackups() {
  document.getElementById('btn-backup-export')?.addEventListener('click', () => {
    chrome.storage.local.get(null, (allData) => {
      const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `Praescius_Backup_${Date.now()}.json`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    });
  });

  document.getElementById('btn-backup-import')?.addEventListener('change', (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importedData = JSON.parse(e.target.result);
        chrome.storage.local.clear(() => {
          chrome.storage.local.set(importedData, () => {
            loadWatchlist();
            loadPaperAccount();
            loadJournal();
            loadRuleDropdowns();
            const status = document.getElementById('backup-status');
            if (status) {
              status.textContent = '✓ System Backup Restored Successfully!';
              status.style.display = 'block';
              setTimeout(() => { status.style.display = 'none'; }, 4000);
            }
          });
        });
      } catch (err) {
        alert(`Backup restore failed: ${err.message}`);
      }
    };
    reader.readAsText(file);
  });
}

/* ==========================================
   15. FINANCIAL CALCULATORS
   ========================================== */
function initCalculators() {
  const balanceInput = document.getElementById('risk-calc-balance');
  const pctInput = document.getElementById('risk-calc-pct');
  const entryInput = document.getElementById('pos-calc-entry');
  const slInput = document.getElementById('pos-calc-sl');
  const wrInput = document.getElementById('exp-calc-winrate');
  const winInput = document.getElementById('exp-calc-win');
  const lossInput = document.getElementById('exp-calc-loss');

  // Trigger calculations on typing
  balanceInput?.addEventListener('input', runCalculations);
  pctInput?.addEventListener('input', runCalculations);
  entryInput?.addEventListener('input', runCalculations);
  slInput?.addEventListener('input', runCalculations);
  wrInput?.addEventListener('input', runCalculations);
  winInput?.addEventListener('input', runCalculations);
  lossInput?.addEventListener('input', runCalculations);
}

function runCalculations() {
  // 1. Risk Calculator
  const bal = parseFloat(document.getElementById('risk-calc-balance').value) || 0;
  const pct = parseFloat(document.getElementById('risk-calc-pct').value) || 0;
  const cashRisk = bal * (pct / 100);
  document.getElementById('risk-calc-result').textContent = `$${cashRisk.toFixed(2)} USD`;

  // 2. Position Size Calculator
  const entry = parseFloat(document.getElementById('pos-calc-entry').value) || 0;
  const sl = parseFloat(document.getElementById('pos-calc-sl').value) || 0;
  const riskPriceDiff = Math.abs(entry - sl);
  
  if (riskPriceDiff > 0 && cashRisk > 0) {
    const units = cashRisk / riskPriceDiff;
    const cashVal = units * entry;
    document.getElementById('pos-calc-result-units').textContent = `${units.toFixed(4)} Units`;
    document.getElementById('pos-calc-result-cash').textContent = `$${cashVal.toFixed(2)} USD`;
  } else {
    document.getElementById('pos-calc-result-units').textContent = '0.0000 Units';
    document.getElementById('pos-calc-result-cash').textContent = '$0.00 USD';
  }

  // 3. Trade Expectancy Calculator
  const wr = parseFloat(document.getElementById('exp-calc-winrate').value) || 0;
  const avgWin = parseFloat(document.getElementById('exp-calc-win').value) || 0;
  const avgLoss = parseFloat(document.getElementById('exp-calc-loss').value) || 0;
  const winFraction = wr / 100;
  const expectancy = (winFraction * avgWin) - ((1 - winFraction) * avgLoss);

  const expEl = document.getElementById('exp-calc-result');
  expEl.textContent = `${expectancy >= 0 ? '+' : ''}$${expectancy.toFixed(2)} USD / Trade`;
  expEl.style.color = expectancy >= 0 ? 'var(--success)' : 'var(--danger)';
}
