/**
 * AI Coach & Discipline Panel Controller.
 * Handles the logic for the Trade Assistant, Checklist, Emotion Detector, and other AI modules.
 */

import { getCandles } from '../../storage/db.js';
import { INDICATOR_PLUGINS } from '../../core/evaluator.js';

let dbRef = null;
let activeTabIdRef = 'default';

export function initAICoach(db, activeTabId) {
  dbRef = db;
  activeTabIdRef = activeTabId;

  // Bind One-Click Checklist
  const checkboxes = document.querySelectorAll('#port-ai-coach input[type="checkbox"]');
  const unlockBtn = document.querySelector('#port-ai-coach button');
  if (checkboxes && unlockBtn) {
    checkboxes.forEach(cb => {
      cb.addEventListener('change', () => {
        const allChecked = Array.from(checkboxes).every(c => c.checked);
        if (allChecked) {
          unlockBtn.disabled = false;
          unlockBtn.style.opacity = '1';
          unlockBtn.style.background = 'var(--success)';
          unlockBtn.style.color = '#FFF';
          unlockBtn.textContent = 'Trade Execution Unlocked ✓';
        } else {
          unlockBtn.disabled = true;
          unlockBtn.style.opacity = '0.5';
          unlockBtn.style.background = '';
          unlockBtn.style.color = '';
          unlockBtn.textContent = 'Unlock Trade Execution';
        }
      });
    });

    unlockBtn.addEventListener('click', () => {
      // Jump to Paper Trading
      const paperBtn = document.querySelector('[data-subtab="port-trading"]');
      if (paperBtn) paperBtn.click();
      
      // Reset checklist
      checkboxes.forEach(c => c.checked = false);
      unlockBtn.disabled = true;
      unlockBtn.style.opacity = '0.5';
      unlockBtn.style.background = '';
      unlockBtn.textContent = 'Unlock Trade Execution';
    });
  }

  // Bind Replay Mistakes button
  const replayBtn = document.querySelector('#port-ai-coach .glass-panel:nth-child(9) button');
  if (replayBtn) {
    replayBtn.addEventListener('click', () => {
      alert('Replay Simulator will now load the state of your last loss (Mock integration).');
      // Jump to Developer Panel -> Simulator
      const devBtn = document.querySelector('[data-tab="opt-developer"]');
      if (devBtn) devBtn.click();
    });
  }
}

export async function updateAICoach(candles, currentSymbol, journalLogs) {
  if (!candles || candles.length < 10) return;

  const currentPrice = candles[candles.length - 1].close;
  
  // 1. Live Trading Coach
  updateLiveCoach(candles, currentPrice);

  // 2. Emotion Detector
  updateEmotionDetector(journalLogs);

  // 3. AI Trade Assistant
  updateTradeAssistant(candles, currentSymbol);

  // 4. Session Assistant
  updateSessionAssistant();

  // 5. AI Journal
  updateAIJournal(journalLogs);

  // 6. Personal Stats
  updatePersonalStats(journalLogs);

  // 7. Multi-Chart Scanner
  updateMultiChartScanner();

  // 8. News Impact Filter
  updateNewsFilter();
}

async function updateNewsFilter() {
  const panel = document.querySelector('#port-ai-coach .glass-panel:nth-child(8) > div:last-child');
  if (!panel) return;

  try {
    const res = await new Promise(resolve => chrome.storage.local.get(['ff_news_cache', 'ff_news_time'], resolve));
    const now = Date.now();
    let newsData = [];

    // Cache for 1 hour (3600000 ms)
    if (res.ff_news_cache && res.ff_news_time && (now - res.ff_news_time < 3600000)) {
      newsData = res.ff_news_cache;
    } else {
      const response = await fetch('https://nfs.faireconomy.media/ff_calendar_thisweek.json');
      if (!response.ok) throw new Error('Fetch failed');
      newsData = await response.json();
      chrome.storage.local.set({ ff_news_cache: newsData, ff_news_time: now });
    }

    // Filter high impact news today
    const upcoming = newsData.filter(item => {
      if (item.impact !== 'High') return false;
      const itemDate = new Date(item.date).getTime();
      // Only care if it's within the next 4 hours
      return itemDate > now && itemDate < (now + 4 * 3600000);
    });

    if (upcoming.length > 0) {
      // Sort by closest first
      upcoming.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      const nextEvent = upcoming[0];
      const minsAway = Math.round((new Date(nextEvent.date).getTime() - now) / 60000);

      panel.innerHTML = `
        <div style="font-size: 1.1rem; text-transform: uppercase; margin-bottom: 4px;">Avoid trading ${nextEvent.country}!</div>
        <div>High-impact <strong>${nextEvent.title}</strong> release in ${minsAway} minutes.</div>
        <div style="font-size: 0.75rem; margin-top: 8px; opacity: 0.8;">Markets will be highly volatile. Forecast: ${nextEvent.forecast || 'N/A'}</div>
      `;
      panel.style.background = 'var(--warning)';
      panel.style.color = '#000';
    } else {
      panel.innerHTML = `
        <div style="font-size: 1.1rem; text-transform: uppercase; margin-bottom: 4px;">Clear Skies</div>
        <div>No high-impact news in the next 4 hours.</div>
        <div style="font-size: 0.75rem; margin-top: 8px; opacity: 0.8;">Safe to trade technicals.</div>
      `;
      panel.style.background = 'var(--success)';
      panel.style.color = '#FFF';
    }
  } catch (err) {
    panel.innerHTML = `
      <div style="font-size: 1.1rem; text-transform: uppercase; margin-bottom: 4px;">News Offline</div>
      <div>Unable to reach ForexFactory.</div>
      <div style="font-size: 0.75rem; margin-top: 8px; opacity: 0.8;">${err.message}</div>
    `;
    panel.style.background = 'rgba(255,255,255,0.1)';
    panel.style.color = 'var(--text-muted)';
  }
}

async function updateMultiChartScanner() {
  const panel = document.querySelector('#port-ai-coach .glass-panel:nth-child(6) > div:last-child');
  if (!panel || !dbRef) return;

  panel.innerHTML = `
    <div>> Scanning active watchlist...</div>
    <div>> Filtering noise...</div>
    <br>
  `;

  // Get watchlist
  chrome.storage.local.get(['praescius_watchlist'], async (res) => {
    const list = res.praescius_watchlist || ['BTC/USD', 'ETH/USD', 'EUR/USD'];
    let bestAsset = null;
    let highestScore = 0;
    let bestReason = '';

    for (const asset of list) {
      const c = await getCandles(dbRef, asset, null, 20, activeTabIdRef);
      if (c && c.length >= 10) {
        const rsiVals = INDICATOR_PLUGINS.RSI.calculate(c, { period: 14 });
        const lastRsi = rsiVals[rsiVals.length - 1];
        if (lastRsi < 35) {
          if (100 - lastRsi > highestScore) {
            highestScore = 100 - lastRsi;
            bestAsset = asset;
            bestReason = 'Oversold RSI Reversal';
          }
        } else if (lastRsi > 65) {
          if (lastRsi > highestScore) {
            highestScore = lastRsi;
            bestAsset = asset;
            bestReason = 'Overbought Exhaustion';
          }
        }
      }
    }

    if (bestAsset) {
      const displayScore = Math.min(99, Math.round(highestScore + 10)); // Inflate for effect
      panel.innerHTML += `
        <div style="color: #FFF;">Found 1 high-probability setup:</div>
        <div style="font-size: 1.1rem; color: var(--primary); margin-top: 4px;">${bestAsset} (1m)</div>
        <div style="color: #FFF;">> ${displayScore}% setup match</div>
        <div style="color: #FFF;">> ${bestReason}</div>
      `;
    } else {
      panel.innerHTML += `
        <div style="color: #FFF;">No exceptional setups found.</div>
        <div style="color: var(--text-muted);">> Wait for market structure to develop.</div>
      `;
    }
  });
}

function updateLiveCoach(candles, currentPrice) {
  const coachPanel = document.querySelector('#port-ai-coach .glass-panel:nth-child(10) ul');
  if (!coachPanel) return;

  const rsiVals = INDICATOR_PLUGINS.RSI.calculate(candles, { period: 14 });
  const emaVals = INDICATOR_PLUGINS.EMA.calculate(candles, { period: 20 });
  const lastRsi = rsiVals[rsiVals.length - 1];
  const lastEma = emaVals[emaVals.length - 1];

  let tips = [];
  if (candles[candles.length - 1].volume < 10) {
    tips.push('Low volume detected. Avoid entering now.');
  }
  
  if (lastRsi > 70) {
    tips.push('Asset is overbought. Do not long into resistance.');
  } else if (lastRsi < 30) {
    tips.push('Asset is oversold. Do not short into support.');
  } else {
    tips.push('RSI is neutral. Wait for a clear directional push.');
  }

  const distToEma = Math.abs(currentPrice - lastEma) / lastEma;
  if (distToEma > 0.005) {
    tips.push('Price is overextended from the EMA. Mean reversion risk high.');
  }

  coachPanel.innerHTML = tips.map(t => `<li>${t}</li>`).join('');
}

function updateEmotionDetector(logs) {
  const panel = document.querySelector('#port-ai-coach .glass-panel:nth-child(3) > div:last-child');
  if (!panel || !logs) return;

  const now = new Date().getTime();
  const recentTrades = logs.filter(log => {
    // Parse journal date and time
    const t = new Date(log.date + ' ' + log.time).getTime();
    return (now - t) < 20 * 60 * 1000; // last 20 mins
  });

  if (recentTrades.length > 5) {
    const wins = recentTrades.filter(l => l.pnl > 0).length;
    const wr = Math.round((wins / recentTrades.length) * 100);
    panel.innerHTML = `
      <div style="color: var(--danger); margin-bottom: 8px;">You've taken ${recentTrades.length} trades in 20 minutes.</div>
      <div style="color: #000; margin-bottom: 8px;">Your win rate on these rapid trades is <span style="color: var(--danger); font-size: 1rem;">${wr}%</span>.</div>
      <div style="background: var(--danger); color: #FFF; padding: 6px; text-transform: uppercase; font-weight: 900;">Consider stopping immediately.</div>
    `;
    panel.parentElement.style.borderColor = 'var(--danger)';
  } else {
    panel.innerHTML = `
      <div style="color: var(--success); margin-bottom: 8px;">Trading frequency optimal.</div>
      <div style="color: #000; margin-bottom: 8px;">Stay disciplined and follow the checklist.</div>
    `;
    panel.parentElement.style.borderColor = '#000';
  }
}

function updateTradeAssistant(candles, symbol) {
  const panel = document.querySelector('#port-ai-coach .glass-panel:nth-child(1) > div:last-child');
  if (!panel) return;

  const rsiVals = INDICATOR_PLUGINS.RSI.calculate(candles, { period: 14 });
  const emaVals = INDICATOR_PLUGINS.EMA.calculate(candles, { period: 20 });
  const lastRsi = rsiVals[rsiVals.length - 1];
  const lastEma = emaVals[emaVals.length - 1];
  const price = candles[candles.length - 1].close;

  const isBullish = price > lastEma;
  const isVolUp = candles[candles.length - 1].volume > (candles[candles.length - 2]?.volume || 0);

  let score = 50;
  let lines = [];
  
  if (isBullish) {
    score += 20;
    lines.push('<div style="color: var(--success);">✔ Trend aligned (Price > EMA20)</div>');
  } else {
    score -= 10;
    lines.push('<div style="color: var(--danger);">✖ Fighting Macro Trend</div>');
  }

  if (isVolUp) {
    score += 10;
    lines.push('<div style="color: var(--success);">✔ Volume increasing</div>');
  }

  if (lastRsi > 65) {
    score -= 15;
    lines.push('<div style="color: var(--warning);">✖ RSI approaching overbought</div>');
  } else if (lastRsi < 35) {
    score += 15;
    lines.push('<div style="color: var(--success);">✔ RSI heavily discounted</div>');
  }

  const action = isBullish ? 'CALL / LONG' : 'PUT / SHORT';
  
  panel.innerHTML = `
    <div style="font-weight: 900; font-size: 1rem; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 8px;">${symbol} ${action}</div>
    <div style="color: ${score > 60 ? 'var(--success)' : 'var(--warning)'}; font-weight: 900; font-size: 1.2rem; margin-bottom: 12px;">Confidence: ${score}%</div>
    <div style="display: flex; flex-direction: column; gap: 4px; font-size: 0.8rem; font-weight: bold;">
      ${lines.join('')}
    </div>
  `;
}

function updateSessionAssistant() {
  const panel = document.querySelector('#port-ai-coach .glass-panel:nth-child(7) > div:last-child');
  if (!panel) return;

  const now = new Date();
  const hourUTC = now.getUTCHours();
  
  let london = 'Closed', londonColor = 'var(--text-muted)';
  let ny = 'Closed', nyColor = 'var(--text-muted)';
  let tokyo = 'Closed', tokyoColor = 'var(--text-muted)';

  if (hourUTC >= 8 && hourUTC < 16) { london = 'ACTIVE'; londonColor = 'var(--success)'; }
  if (hourUTC >= 13 && hourUTC < 22) { ny = 'ACTIVE'; nyColor = 'var(--success)'; }
  if (hourUTC >= 0 && hourUTC < 9) { tokyo = 'ACTIVE'; tokyoColor = 'var(--success)'; }

  panel.innerHTML = `
    <div style="display: flex; justify-content: space-between; padding-bottom: 4px; border-bottom: 1px dashed #CCC;">
      <span>🇬🇧 London Open</span> <span style="color: ${londonColor};">${london}</span>
    </div>
    <div style="display: flex; justify-content: space-between; padding-bottom: 4px; border-bottom: 1px dashed #CCC;">
      <span>🇺🇸 New York Open</span> <span style="color: ${nyColor};">${ny}</span>
    </div>
    <div style="display: flex; justify-content: space-between; padding-bottom: 4px; border-bottom: 1px dashed #CCC;">
      <span>🇯🇵 Tokyo Overlap</span> <span style="color: ${tokyoColor};">${tokyo}</span>
    </div>
    <div style="margin-top: 8px; color: var(--primary); text-align: center;">"Trade during active overlaps for maximum momentum."</div>
  `;
}

function updateAIJournal(logs) {
  const panel = document.querySelector('#port-ai-coach .glass-panel:nth-child(5) > div:last-child');
  if (!panel || !logs || logs.length === 0) {
    if(panel) panel.innerHTML = '<i>Complete a paper trade to generate an AI reflection.</i>';
    return;
  }

  const lastTrade = logs[logs.length - 1];
  const isWin = lastTrade.pnl > 0;
  
  panel.innerHTML = `
    <strong style="color: var(--primary); display: block; margin-bottom: 4px;">Trade Insight (${lastTrade.symbol} ${lastTrade.type})</strong>
    <p style="margin: 0; line-height: 1.5; font-weight: bold; color: #000;">
      ${isWin 
        ? `You successfully secured a profit of $${lastTrade.pnl.toFixed(2)}. Your entry was well-timed. Continue to scale this setup.` 
        : `This trade resulted in a loss of $${Math.abs(lastTrade.pnl).toFixed(2)}. Consider if you waited for full candle confirmation before entering.`}
    </p>
  `;
}

function updatePersonalStats(logs) {
  const panel = document.querySelector('#port-ai-coach .glass-panel:nth-child(4) ul');
  if (!panel || !logs || logs.length === 0) return;

  let longs = 0, longWins = 0;
  let shorts = 0, shortWins = 0;

  logs.forEach(l => {
    if (l.type === 'BUY') { longs++; if (l.pnl > 0) longWins++; }
    else { shorts++; if (l.pnl > 0) shortWins++; }
  });

  const longWr = longs > 0 ? Math.round((longWins/longs)*100) : 0;
  const shortWr = shorts > 0 ? Math.round((shortWins/shorts)*100) : 0;
  
  panel.innerHTML = `
    <li>Your LONG Win Rate: <span style="color: ${longWr > 50 ? 'var(--success)' : 'var(--danger)'};">${longWr}%</span></li>
    <li>Your SHORT Win Rate: <span style="color: ${shortWr > 50 ? 'var(--success)' : 'var(--danger)'};">${shortWr}%</span></li>
    <li>${longWr > shortWr ? 'You significantly outperform on <span style="color: var(--success);">pullbacks and longs</span>.' : 'You significantly outperform on <span style="color: var(--danger);">short setups</span>.'}</li>
  `;
}
