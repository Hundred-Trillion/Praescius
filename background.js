/**
 * Background Service Worker (V2).
 * Operates on an Event Bus pattern to coordinate decoding, evaluation, and persistence.
 */

import { eventBus } from './core/eventBus.js';
import { initDB, saveLog, getLogs } from './storage/db.js';
import { providerManager } from './providers/providerManager.js';
import { AppLogger } from './core/logger.js';
import { compileRule, parseDSL } from './core/compiler.js';
import { evaluateRule, getMLConfidenceReport } from './core/evaluator.js';
import { showNotification } from './core/notifier.js';
import { aiManager } from './ai/aiManager.js';
import { replayEngine } from './core/replay.js';
import { stateMachine } from './core/stateMachine.js';
import { telemetry } from './core/telemetry.js';
import RSI from './indicators/RSI.js';
import EMA from './indicators/EMA.js';
import SMA from './indicators/SMA.js';
import MACD from './indicators/MACD.js';

const rsiCalculator = new RSI();
const emaCalculator = new EMA();
const smaCalculator = new SMA();
const macdCalculator = new MACD();

let db = null;
let appLogger = null;

let latestDiscovery = {
  chartEngine: 'Pending',
  transport: 'Pending',
  dataSource: 'Pending',
  candlesFound: false,
  confidence: 0
};

// In-memory cache for candle series
const candleCache = {};
const CACHE_LIMIT = 200;

// Rules cooldown cache
const ruleCooldowns = {};
const COOLDOWN_MS = 60 * 1000;

// Dynamic adaptive confidences state for DOM scraped fallback channels
const adaptiveConfidences = {
  dom_selector: 0.8,
  dom_title: 0.5
};
const latestWsPrices = {}; // Tracks latest raw WS prices to compare and calibrate DOM selectors

/**
 * Open/Initialize Database layer.
 */
async function getDB() {
  if (!db) {
    db = await initDB();
    appLogger = new AppLogger(db);
  }
  return db;
}

// ----------------------------------------------------
// Event Bus Registrations
// ----------------------------------------------------

// 1. Raw Socket Frame handler -> Parser
eventBus.subscribe('market.tick.v1', (payload) => {
  try {
    stateMachine.transitionTo('LIVE_WS');
    telemetry.startWsSession();
    telemetry.endDomSession();

    const tStart = performance.now();
    const candle = providerManager.parseFrame(payload, 'incoming');
    const tEnd = performance.now();
    
    telemetry.recordProviderLatency(tEnd - tStart);

    if (candle) {
      // Add dynamic source confidence
      candle.source = 'ws';
      candle.confidence = 1.0;
      eventBus.publish('market.candle.v1', candle);
    }
  } catch (err) {
    console.error('[Background] WS Parsing error:', err);
    telemetry.logSelectorFailure();
  }
});

// 2. Parsed Candle handler -> Cache, DB, Rule evaluation
eventBus.subscribe('market.candle.v1', async (candle) => {
  const symbol = candle.symbol;
  const tf = candle.timeframe;
  const key = `${symbol}_${tf}`;

  // Transition state machines based on candle source
  if (candle.source && candle.source.startsWith('dom')) {
    stateMachine.transitionTo('LIVE_DOM');
    telemetry.startDomSession();
    telemetry.endWsSession();

    candle.confidence = adaptiveConfidences[candle.source] || candle.confidence || 0.8;
    
    const lastWs = latestWsPrices[symbol];
    if (lastWs && (Date.now() - lastWs.timestamp < 5000)) {
      const delta = Math.abs(lastWs.price - candle.price);
      const pctDelta = delta / lastWs.price;
      
      console.log(`[Aetheris Validation] ${symbol} | WS: ${lastWs.price} | DOM: ${candle.price} | Delta: ${delta.toFixed(4)} (${(pctDelta * 100).toFixed(4)}%)`);
      
      if (pctDelta < 0.0005) {
        adaptiveConfidences[candle.source] = Math.min(0.99, adaptiveConfidences[candle.source] + 0.001);
      } else if (pctDelta > 0.005) {
        adaptiveConfidences[candle.source] = Math.max(0.1, adaptiveConfidences[candle.source] - 0.01);
      }
    }
  } else if (candle.source === 'replay_engine') {
    stateMachine.transitionTo('REPLAY');
    telemetry.endWsSession();
    telemetry.endDomSession();
  } else {
    latestWsPrices[symbol] = {
      price: candle.price,
      timestamp: Date.now()
    };
  }

  if (appLogger) {
    await appLogger.logTickComparison(symbol, candle.price, candle.source || 'ws', candle.confidence || 1.0);
  }

  if (!candleCache[key]) {
    candleCache[key] = [];
  }

  const cache = candleCache[key];
  const lastIndex = cache.length - 1;

  if (lastIndex >= 0 && cache[lastIndex].timestamp === candle.timestamp) {
    cache[lastIndex] = candle;
  } else {
    cache.push(candle);
    if (cache.length > CACHE_LIMIT) {
      cache.shift();
    }
    
    chrome.storage.local.get(['settings'], async (res) => {
      if (res.settings?.loggingEnabled !== false && appLogger) {
        await appLogger.logCandle(candle);
      }
    });
  }

  chrome.runtime.sendMessage({
    action: 'CANDLE_UPDATE',
    candle: candle
  }, () => {
    if (chrome.runtime.lastError) {
      // ignore
    }
  });

  evaluateActiveRules(symbol, tf);
});

// 3. System Log event handler
eventBus.subscribe('system.logs.v1', async (log) => {
  console.log(`[EventBus Log][${log.type}] ${log.message}`);
  if (appLogger) {
    await appLogger.logSystemEvent(log.message, log.type);
  }
});

// 4. Provider Connected / Disconnected dispatcher
eventBus.subscribe('system.state.changed.v1', (event) => {
  if (event.to === 'LIVE_WS' || event.to === 'LIVE_DOM') {
    eventBus.publish('provider.connected.v1', {
      provider: providerManager.activeProvider?.name || 'unknown',
      state: event.to,
      timestamp: Date.now()
    });
  } else if (event.to === 'OFFLINE' || event.to === 'ERROR') {
    eventBus.publish('provider.disconnected.v1', {
      provider: providerManager.activeProvider?.name || 'unknown',
      state: event.to,
      timestamp: Date.now()
    });
  }
});

// ----------------------------------------------------
// Rule evaluations
// ----------------------------------------------------
function evaluateActiveRules(symbol, timeframe) {
  const key = `${symbol}_${timeframe}`;
  const cache = candleCache[key];
  if (!cache || cache.length < 5) return;

  chrome.storage.local.get(['rules', 'settings'], async (res) => {
    const rules = res.rules || [];
    const settings = res.settings || {};

    if (settings.notificationsEnabled === false) return;

    for (const rule of rules) {
      if (!rule.enabled) continue;

      const ruleId = rule.id;
      const now = Date.now();

      if (ruleCooldowns[ruleId] && (now - ruleCooldowns[ruleId] < COOLDOWN_MS)) {
        continue;
      }

      const isTriggered = evaluateRule(cache, rule);
      if (isTriggered) {
        ruleCooldowns[ruleId] = now;
        
        const latestCandle = cache[cache.length - 1];
        const latestPrice = latestCandle.close;
        const confidence = latestCandle.confidence || 1.0;
        const trend = latestPrice > cache[cache.length - 5].close ? 'bullish' : 'bearish';
        
        let rsi = null;
        let ema9 = null;
        let ema21 = null;
        let sma20 = null;
        let macd = null;

        try {
          const rsiVals = rsiCalculator.calculate(cache, { period: 14 });
          const r = rsiVals[rsiVals.length - 1];
          if (typeof r === 'number') rsi = Number(r.toFixed(2));
        } catch (e) {}

        try {
          const ema9Vals = emaCalculator.calculate(cache, { period: 9 });
          const e9 = ema9Vals[ema9Vals.length - 1];
          if (typeof e9 === 'number') ema9 = Number(e9.toFixed(2));
        } catch (e) {}

        try {
          const ema21Vals = emaCalculator.calculate(cache, { period: 21 });
          const e21 = ema21Vals[ema21Vals.length - 1];
          if (typeof e21 === 'number') ema21 = Number(e21.toFixed(2));
        } catch (e) {}

        try {
          const sma20Vals = smaCalculator.calculate(cache, { period: 20 });
          const s20 = sma20Vals[sma20Vals.length - 1];
          if (typeof s20 === 'number') sma20 = Number(s20.toFixed(2));
        } catch (e) {}

        try {
          const macdVals = macdCalculator.calculate(cache);
          const mObj = macdVals[macdVals.length - 1];
          if (mObj && typeof mObj.macd === 'number') {
            macd = {
              macd: Number(mObj.macd.toFixed(4)),
              signal: Number(mObj.signal.toFixed(4)),
              histogram: Number(mObj.histogram.toFixed(4))
            };
          }
        } catch (e) {}

        const mlConfidence = getMLConfidenceReport(cache, rule, confidence);

        const summary = {
          symbol,
          trend,
          triggerRule: rule.name,
          lastPrice: latestPrice,
          confidence: mlConfidence.aggregateScore,
          mlConfidenceDetails: mlConfidence,
          timestamp: now,
          context: {
            last20Ticks: cache.slice(-20).map(c => ({
              t: Math.floor(c.timestamp / 1000),
              p: c.price,
              src: c.source || 'ws',
              conf: Number(c.confidence || 1.0)
            })),
            rsi,
            ema9,
            ema21,
            sma20,
            macd
          }
        };

        const provider = settings.aiProvider || 'local';
        const apiKey = provider === 'gemini' ? settings.geminiKey : 
                       provider === 'openai' ? settings.openaiKey : '';
        
        let alertText = '';
        const tStartNotif = performance.now();
        try {
          alertText = await aiManager.summarizeNotification(provider, apiKey, summary);
        } catch (e) {
          alertText = `Rule: "${rule.name}" met.\nPrice: ${latestPrice.toLocaleString()}\nTime: ${new Date().toLocaleTimeString()}`;
        }
        const tEndNotif = performance.now();
        telemetry.recordNotificationLatency(tEndNotif - tStartNotif);

        const title = `${symbol} [V2 Alert]`;
        showNotification(title, alertText);

        // Publish versioned triggers and summary events
        eventBus.publish('market.rule.trigger.v1', {
          ruleId,
          ruleName: rule.name,
          symbol,
          price: latestPrice,
          mlConfidence,
          timestamp: now
        });

        eventBus.publish('market.ai.summary.v1', {
          ruleId,
          alertText,
          provider,
          timestamp: now
        });

        eventBus.publish('system.logs.v1', {
          message: `Rule triggered: "${rule.name}" (Aggregate Confidence: ${(mlConfidence.aggregateScore * 100).toFixed(0)}%)`,
          type: 'info'
        });
      }
    }
  });
}

// ----------------------------------------------------
// Service Worker Startup & Installation Orchestration
// ----------------------------------------------------
async function startup() {
  try {
    await getDB();
    await providerManager.loadPlugins();
    stateMachine.transitionTo('CONNECTING');
  } catch (err) {
    console.error('[Background] Startup error:', err);
  }
}
startup();

chrome.runtime.onInstalled.addListener(async () => {
  try {
    await startup();
    eventBus.publish('system.logs.v1', { message: 'Aetheris Market Observer V2 installed and initialized successfully.', type: 'info' });
    
    chrome.storage.local.get(['settings', 'rules'], (res) => {
      if (!res.settings) {
        chrome.storage.local.set({
          settings: {
            aiProvider: 'local',
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleRuntimeMessage(message, sender, sendResponse);
  return true;
});

async function handleRuntimeMessage(message, sender, sendResponse) {
  try {
    const database = await getDB();

    switch (message.action) {
      case 'WS_FRAME':
        if (sender.tab && sender.tab.url) {
          providerManager.detectProvider(sender.tab.url, sender.tab.title);
        }
        eventBus.publish('market.tick.v1', message.payload);
        
        chrome.runtime.sendMessage({
          action: 'RAW_WS_FRAME',
          payload: message.payload
        }, () => {
          if (chrome.runtime.lastError) {
            // ignore
          }
        });

        sendResponse({ success: true });
        break;

      case 'DOM_TICK':
        if (sender.tab && sender.tab.url) {
          providerManager.detectProvider(sender.tab.url, sender.tab.title);
        }
        const domPrice = Number(message.price);
        const domSymbol = message.symbol || 'EUR/USD';
        const domTimestamp = Number(message.timestamp || Date.now());
        const domSource = message.source || 'dom_selector';
        const domConfidence = Number(message.confidence || 0.8);
        
        const domCandle = {
          schema: 1,
          provider: providerManager.activeProvider?.name || 'dom_fallback',
          symbol: domSymbol,
          timestamp: domTimestamp,
          open: domPrice,
          high: domPrice,
          low: domPrice,
          close: domPrice,
          price: domPrice,
          volume: 0,
          timeframe: 'tick',
          source: domSource,
          confidence: domConfidence
        };
        
        eventBus.publish('market.candle.v1', domCandle);
        sendResponse({ success: true });
        break;

      case 'GET_PROVIDER_SELECTORS':
        const requestUrl = message.url;
        const matchingProvider = providerManager.providers.find(p => p.matches(requestUrl, ''));
        if (matchingProvider) {
          sendResponse({ success: true, selectors: matchingProvider.selectors || [] });
        } else {
          sendResponse({ success: false, selectors: [] });
        }
        break;

      case 'DISCOVERY_REPORT':
        latestDiscovery = message.data;
        const cacheKeys = Object.keys(candleCache);
        if (cacheKeys.length > 0) {
          latestDiscovery.candlesFound = true;
        }
        sendResponse({ success: true });
        break;

      case 'GET_STATUS':
        const stats = appLogger ? await appLogger.getStats() : { totalLogged: 0 };
        const logs = await getLogs(database, 30);
        
        let latestCandle = null;
        if (candleCache['BTC/USD_1m'] && candleCache['BTC/USD_1m'].length > 0) {
          latestCandle = candleCache['BTC/USD_1m'][candleCache['BTC/USD_1m'].length - 1];
        } else {
          const keys = Object.keys(candleCache);
          if (keys.length > 0 && candleCache[keys[0]].length > 0) {
            latestCandle = candleCache[keys[0]][candleCache[keys[0]].length - 1];
          }
        }

        sendResponse({
          success: true,
          discovery: latestDiscovery,
          stats: stats,
          logs: logs,
          latestCandle: latestCandle,
          activeProvider: providerManager.activeProvider?.name || 'none',
          state: stateMachine.getCurrentState(),
          telemetry: telemetry.getSummary(),
          replayState: {
            isPlaying: replayEngine.isPlaying,
            currentIndex: replayEngine.currentIndex,
            totalCandles: replayEngine.candles.length
          }
        });
        break;

      case 'TRANSLATE_RULE':
        const promptText = String(message.prompt || '').trim();
        if (promptText.toUpperCase().startsWith('WHEN')) {
          try {
            const compiledRule = parseDSL(promptText);
            sendResponse({ success: true, rule: compiledRule });
          } catch (err) {
            sendResponse({ success: false, error: err.message });
          }
          break;
        }

        chrome.storage.local.get(['settings'], async (res) => {
          const settings = res.settings || {};
          const provider = settings.aiProvider || 'local';
          const apiKey = provider === 'gemini' ? settings.geminiKey : 
                         provider === 'openai' ? settings.openaiKey : '';
                         
          try {
            // 1. Translate via AIManager
            const rawRule = await aiManager.translate(provider, apiKey, promptText);
            
            // 2. Validate and Compile via compileRule
            const compiledRule = compileRule(rawRule);
            
            sendResponse({ success: true, rule: compiledRule });
          } catch (err) {
            sendResponse({ success: false, error: err.message });
          }
        });
        break;

      case 'REPLAY_COMMAND':
        if (message.command === 'load') {
          replayEngine.loadCandles(message.data);
        } else if (message.command === 'start') {
          replayEngine.start(message.speed);
        } else if (message.command === 'pause') {
          replayEngine.pause();
        } else if (message.command === 'stop') {
          replayEngine.stop();
        } else if (message.command === 'step') {
          replayEngine.step();
        }
        sendResponse({
          success: true,
          replayState: {
            isPlaying: replayEngine.isPlaying,
            currentIndex: replayEngine.currentIndex,
            totalCandles: replayEngine.candles.length
          }
        });
        break;

      case 'TEST_NOTIFICATION':
        showNotification('Aetheris Market Observer Test', 'Observer connection and notifier are working correctly!');
        sendResponse({ success: true });
        break;

      default:
        sendResponse({ success: false, error: `Unknown action: ${message.action}` });
    }
  } catch (err) {
    console.error('Error handling message:', message, err);
    sendResponse({ success: false, error: err.message });
  }
}
