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
import { ReplayEngine } from './core/replay.js';
import { stateMachine } from './core/stateMachine.js';
import { telemetry } from './core/telemetry.js';
import RSI from './indicators/RSI.js';
import EMA from './indicators/EMA.js';
import SMA from './indicators/SMA.js';
import MACD from './indicators/MACD.js';
import ConsensusEngine from './engine/ConsensusEngine.js';
import AlertEngine from './engine/AlertEngine.js';

const rsiCalculator = new RSI();
const emaCalculator = new EMA();
const smaCalculator = new SMA();
const macdCalculator = new MACD();

const alertEngine = new AlertEngine(showNotification, (event, data) => eventBus.publish(event, data));

let db = null;
let appLogger = null;

// Scoped session cache/state by tabId
class Session {
  constructor(tabId, providerName = 'none') {
    this.tabId = tabId;
    this.providerName = providerName;
    this.latestDiscovery = {
      chartEngine: 'Pending',
      transport: 'Pending',
      dataSource: 'Pending',
      candlesFound: false,
      confidence: 0
    };
    this.replayEngine = new ReplayEngine(tabId);
  }
}

const sessions = {};

function getSession(tabId) {
  const tid = tabId || 'default';
  if (!sessions[tid]) {
    sessions[tid] = new Session(tid);
  }
  return sessions[tid];
}

// In-memory cache for candle series (keyed by `${tabId}_${symbol}_${tf}`)
const candleCache = {};
const CACHE_LIMIT = 200;

// Rules cooldown cache (keyed by `${tabId}_${ruleId}`)
const ruleCooldowns = {};
const COOLDOWN_MS = 60 * 1000;

// Dynamic adaptive confidences state for DOM scraped fallback channels (keyed by `${tabId}_${source}`)
const adaptiveConfidences = {};

// Tracks latest raw WS prices to compare and calibrate DOM selectors (keyed by `${tabId}_${symbol}`)
const latestWsPrices = {}; 

// In-memory active building 1m candles aggregated from tick stream (keyed by `${tabId}_${symbol}`)
const activeBuildingCandles = {};

function aggregateTickTo1m(tick) {
  if (tick.timeframe !== 'tick') return null;

  const tabId = tick.tabId || 'default';
  const symbol = tick.symbol;
  const key = `${tabId}_${symbol}`;
  const now = tick.timestamp;
  
  // Calculate start of the minute bucket
  const minuteBucket = Math.floor(now / 60000) * 60000;

  let building = activeBuildingCandles[key];

  if (!building || minuteBucket > building.timestamp) {
    building = {
      schema: 1,
      provider: tick.provider,
      symbol: tick.symbol,
      timestamp: minuteBucket,
      open: tick.price,
      high: tick.price,
      low: tick.price,
      close: tick.price,
      price: tick.price,
      volume: tick.volume || 0,
      timeframe: '1m',
      source: 'tick_aggregator',
      tabId: tabId
    };
    activeBuildingCandles[key] = building;
  } else {
    // Update active building candle
    building.high = Math.max(building.high, tick.price);
    building.low = Math.min(building.low, tick.price);
    building.close = tick.price;
    building.price = tick.price;
    building.volume += tick.volume || 0;
  }

  // Return a copy of the building candle
  return { ...building };
}

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
eventBus.subscribe('market.tick.v1', (event) => {
  try {
    stateMachine.transitionTo('LIVE_WS');
    telemetry.startWsSession();
    telemetry.endDomSession();

    const tStart = performance.now();
    const provider = providerManager.getProviderForUrl(event.url, event.title);
    if (!provider) return;

    const candle = provider.parse(event.payload, event.direction || 'incoming');
    const tEnd = performance.now();
    
    telemetry.recordProviderLatency(tEnd - tStart);

    if (candle) {
      // Add dynamic source confidence and attributes
      candle.source = candle.source || 'ws';
      candle.confidence = candle.confidence || 1.0;
      candle.tabId = event.tabId || 'default';
      candle.provider = provider.name;

      eventBus.publish('market.candle.v1', candle);

      // Notify content script of valid WS tick to suppress DOM fallback
      if (event.tabId && event.tabId !== 'default') {
        chrome.tabs.sendMessage(event.tabId, {
          action: 'VALID_WS_TICK',
          timestamp: Date.now()
        }, () => {
          if (chrome.runtime.lastError) {
            // ignore
          }
        });
      }
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
  const tabId = candle.tabId || 'default';
  const key = `${tabId}_${symbol}_${tf}`;

  // Transition state machines based on candle source
  if (candle.source && candle.source.startsWith('dom')) {
    stateMachine.transitionTo('LIVE_DOM');
    telemetry.startDomSession();
    telemetry.endWsSession();

    const sourceKey = `${tabId}_${candle.source}`;
    if (!adaptiveConfidences[sourceKey]) {
      adaptiveConfidences[sourceKey] = candle.source === 'dom_selector' ? 0.8 : 0.5;
    }
    candle.confidence = adaptiveConfidences[sourceKey];
    
    const wsPriceKey = `${tabId}_${symbol}`;
    const lastWs = latestWsPrices[wsPriceKey];
    if (lastWs && (Date.now() - lastWs.timestamp < 5000)) {
      const delta = Math.abs(lastWs.price - candle.price);
      const pctDelta = delta / lastWs.price;
      
      console.log(`[Aetheris Validation] ${symbol} | WS: ${lastWs.price} | DOM: ${candle.price} | Delta: ${delta.toFixed(4)} (${(pctDelta * 100).toFixed(4)}%)`);
      
      if (pctDelta < 0.0005) {
        adaptiveConfidences[sourceKey] = Math.min(0.99, adaptiveConfidences[sourceKey] + 0.001);
      } else if (pctDelta > 0.005) {
        adaptiveConfidences[sourceKey] = Math.max(0.1, adaptiveConfidences[sourceKey] - 0.01);
      }
      chrome.storage.local.set({ adaptiveConfidences });
    }
  } else if (candle.source === 'replay_engine') {
    stateMachine.transitionTo('REPLAY');
    telemetry.endWsSession();
    telemetry.endDomSession();
  } else {
    const wsPriceKey = `${tabId}_${symbol}`;
    latestWsPrices[wsPriceKey] = {
      price: candle.price,
      timestamp: Date.now()
    };
  }

  if (appLogger) {
    await appLogger.logTickComparison(symbol, candle.price, candle.source || 'ws', candle.confidence || 1.0, candle.provider, tabId);
  }

  if (!candleCache[key]) {
    candleCache[key] = [];
  }

  const cache = candleCache[key];
  const lastIndex = cache.length - 1;

  if (lastIndex >= 0 && cache[lastIndex].timestamp === candle.timestamp) {
    cache[lastIndex] = candle;
  } else {
    // Write completed previous candle to DB to persist actual finalized OHLC values
    if (lastIndex >= 0 && tf !== 'tick') {
      const completedCandle = cache[lastIndex];
      chrome.storage.local.get(['settings'], async (res) => {
        if (res.settings?.loggingEnabled !== false && appLogger) {
          await appLogger.logCandle(completedCandle);
        }
      });
    }

    cache.push(candle);
    if (cache.length > CACHE_LIMIT) {
      cache.shift();
    }
    
    // For ticks, we write to DB immediately because each tick has a unique timestamp
    if (tf === 'tick') {
      chrome.storage.local.get(['settings'], async (res) => {
        if (res.settings?.loggingEnabled !== false && appLogger) {
          await appLogger.logCandle(candle);
        }
      });
    }
  }

  chrome.runtime.sendMessage({
    action: 'CANDLE_UPDATE',
    candle: candle,
    tabId: tabId
  }, () => {
    if (chrome.runtime.lastError) {
      // ignore
    }
  });

  evaluateActiveRules(symbol, tf, tabId, candle.isHistorical);
  evaluateCustomStrategies(symbol, tf, tabId, candle.isHistorical);

  // If this is a raw tick, aggregate it into a 1-minute OHLC candle and publish it too!
  if (tf === 'tick') {
    const aggregated1m = aggregateTickTo1m(candle);
    if (aggregated1m) {
      eventBus.publish('market.candle.v1', aggregated1m);
    }
  }
});

// 3. System Log event handler
eventBus.subscribe('system.logs.v1', async (log) => {
  console.log(`[EventBus Log][${log.type}] ${log.message}`);
  if (appLogger) {
    await appLogger.logSystemEvent(log.message, log.type, log.provider || 'system', log.tabId || 'default');
  }
});

// 4. Provider Connected / Disconnected dispatcher
eventBus.subscribe('system.state.changed.v1', (event) => {
  const activeName = providerManager.activeProvider?.name || 'unknown';
  if (event.to === 'LIVE_WS' || event.to === 'LIVE_DOM') {
    eventBus.publish('provider.connected.v1', {
      provider: activeName,
      state: event.to,
      timestamp: Date.now()
    });
  } else if (event.to === 'OFFLINE' || event.to === 'ERROR') {
    eventBus.publish('provider.disconnected.v1', {
      provider: activeName,
      state: event.to,
      timestamp: Date.now()
    });
  }
});

// ----------------------------------------------------
// Rule evaluations
// ----------------------------------------------------
function evaluateActiveRules(symbol, timeframe, tabId, isHistorical) {
  if (isHistorical) return; // Skip evaluation for historical backfilled candles

  const key = `${tabId}_${symbol}_${timeframe}`;
  const cache = candleCache[key];
  if (!cache || cache.length < 5) return;

  chrome.storage.local.get(['rules', 'settings'], async (res) => {
    const rules = res.rules || [];
    const settings = res.settings || {};

    if (settings.notificationsEnabled === false) return;

    for (const rule of rules) {
      if (!rule.enabled) continue;

      const ruleId = rule.id;
      const cooldownKey = `${tabId}_${ruleId}`;
      const now = Date.now();

      if (ruleCooldowns[cooldownKey] && (now - ruleCooldowns[cooldownKey] < COOLDOWN_MS)) {
        continue;
      }

      const isTriggered = evaluateRule(cache, rule);
      if (isTriggered) {
        ruleCooldowns[cooldownKey] = now;
        
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
          timestamp: now,
          tabId
        });

        eventBus.publish('market.ai.summary.v1', {
          ruleId,
          alertText,
          provider,
          timestamp: now,
          tabId
        });

        eventBus.publish('system.logs.v1', {
          message: `Rule triggered: "${rule.name}" (Aggregate Confidence: ${(mlConfidence.aggregateScore * 100).toFixed(0)}%)`,
          type: 'info',
          tabId,
          provider: latestCandle.provider
        });
      }
    }
  });
}

function evaluateCustomStrategies(symbol, timeframe, tabId, isHistorical) {
  if (isHistorical) return; // Skip evaluation for historical backfilled candles

  const candleKey = `${tabId}_${symbol}_${timeframe}`;
  const tickKey = `${tabId}_${symbol}_tick`;
  const cache = candleCache[candleKey];
  const ticks = candleCache[tickKey] || [];

  if (!cache || cache.length === 0) return;

  chrome.storage.local.get(['activeStrategies', 'settings'], (res) => {
    const activeStrategies = res.activeStrategies || {};
    const settings = res.settings || {};

    try {
      const consensusResult = ConsensusEngine.evaluate(cache, ticks, activeStrategies);
      alertEngine.process(tabId, symbol, timeframe, consensusResult, settings);
    } catch (err) {
      console.error(`[ConsensusEngine] Error running consensus:`, err);
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
    
    // Load persisted adaptive confidences
    chrome.storage.local.get(['adaptiveConfidences'], (res) => {
      if (res.adaptiveConfidences) {
        Object.assign(adaptiveConfidences, res.adaptiveConfidences);
      }
    });
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleRuntimeMessage(message, sender, sendResponse);
  return true;
});

async function handleRuntimeMessage(message, sender, sendResponse) {
  try {
    const database = await getDB();

    switch (message.action) {
      case 'WS_FRAME': {
        const wsTabId = sender.tab ? sender.tab.id : 'default';
        const wsUrl = sender.tab ? sender.tab.url : message.url;
        const wsTitle = sender.tab ? sender.tab.title : '';
        const wsDirection = message.direction || 'incoming';

        const wsProvider = providerManager.getProviderForUrl(wsUrl, wsTitle);
        if (wsProvider) {
          const session = getSession(wsTabId);
          session.providerName = wsProvider.name;
        }

        eventBus.publish('market.tick.v1', {
          payload: message.payload,
          url: wsUrl,
          title: wsTitle,
          tabId: wsTabId,
          direction: wsDirection
        });
        
        chrome.runtime.sendMessage({
          action: 'RAW_WS_FRAME',
          payload: message.payload,
          tabId: wsTabId
        }, () => {
          if (chrome.runtime.lastError) {
            // ignore
          }
        });

        sendResponse({ success: true });
        break;
      }

      case 'DOM_TICK': {
        const domTabId = sender.tab ? sender.tab.id : 'default';
        const domUrl = sender.tab ? sender.tab.url : '';
        const domTitle = sender.tab ? sender.tab.title : '';
        
        const domProvider = providerManager.getProviderForUrl(domUrl, domTitle);
        if (domProvider) {
          const session = getSession(domTabId);
          session.providerName = domProvider.name;
        }

        const domPrice = Number(message.price);
        const domSymbol = message.symbol || 'EUR/USD';
        const domTimestamp = Number(message.timestamp || Date.now());
        const domSource = message.source || 'dom_selector';
        const domConfidence = Number(message.confidence || 0.8);
        
        const domCandle = {
          schema: 1,
          provider: domProvider ? domProvider.name : 'dom_fallback',
          tabId: domTabId,
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
      }

      case 'GET_PROVIDER_SELECTORS': {
        const requestUrl = message.url;
        const matchingProvider = providerManager.providers.find(p => p.matches(requestUrl, ''));
        if (matchingProvider) {
          sendResponse({ success: true, selectors: matchingProvider.selectors || [] });
        } else {
          sendResponse({ success: false, selectors: [] });
        }
        break;
      }

      case 'DISCOVERY_REPORT': {
        const discTabId = sender.tab ? sender.tab.id : 'default';
        const sessionDisc = getSession(discTabId);
        sessionDisc.latestDiscovery = message.data;

        const discKeys = Object.keys(candleCache).filter(k => k.startsWith(`${discTabId}_`));
        if (discKeys.length > 0) {
          sessionDisc.latestDiscovery.candlesFound = true;
        }
        sendResponse({ success: true });
        break;
      }

      case 'GET_STATUS': {
        const statusTabId = message.tabId || 'default';
        const sessionStatus = getSession(statusTabId);
        
        const stats = appLogger ? await appLogger.getStats() : { totalLogged: 0 };
        const logs = await getLogs(database, 30, statusTabId);
        
        let latestCandle = null;
        const sessionKeys = Object.keys(candleCache).filter(k => k.startsWith(`${statusTabId}_`));
        if (sessionKeys.length > 0) {
          let newest = null;
          for (const key of sessionKeys) {
            const list = candleCache[key];
            if (list && list.length > 0) {
              const c = list[list.length - 1];
              if (!newest || c.timestamp > newest.timestamp) {
                newest = c;
              }
            }
          }
          latestCandle = newest;
        }

        const activeReplay = sessionStatus.replayEngine || { isPlaying: false, currentIndex: 0, candles: [] };

        sendResponse({
          success: true,
          discovery: sessionStatus.latestDiscovery,
          stats: stats,
          logs: logs,
          latestCandle: latestCandle,
          activeProvider: sessionStatus.providerName || 'none',
          state: stateMachine.getCurrentState(),
          telemetry: telemetry.getSummary(),
          replayState: {
            isPlaying: activeReplay.isPlaying,
            currentIndex: activeReplay.currentIndex,
            totalCandles: activeReplay.candles ? activeReplay.candles.length : 0
          }
        });
        break;
      }

      case 'TRANSLATE_RULE': {
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
            const rawRule = await aiManager.translate(provider, apiKey, promptText);
            const compiledRule = compileRule(rawRule);
            sendResponse({ success: true, rule: compiledRule });
          } catch (err) {
            sendResponse({ success: false, error: err.message });
          }
        });
        break;
      }

      case 'REPLAY_COMMAND': {
        const rTabId = message.tabId || 'default';
        const session = getSession(rTabId);
        const activeReplayEngine = session.replayEngine;

        if (message.command === 'load') {
          activeReplayEngine.loadCandles(message.data);
        } else if (message.command === 'start') {
          activeReplayEngine.start(message.speed);
        } else if (message.command === 'pause') {
          activeReplayEngine.pause();
        } else if (message.command === 'stop') {
          activeReplayEngine.stop();
        } else if (message.command === 'step') {
          activeReplayEngine.step();
        }
        sendResponse({
          success: true,
          replayState: {
            isPlaying: activeReplayEngine.isPlaying,
            currentIndex: activeReplayEngine.currentIndex,
            totalCandles: activeReplayEngine.candles.length
          }
        });
        break;
      }

      case 'TEST_NOTIFICATION': {
        showNotification('Aetheris Market Observer Test', 'Observer connection and notifier are working correctly!');
        sendResponse({ success: true });
        break;
      }

      default:
        sendResponse({ success: false, error: `Unknown action: ${message.action}` });
    }
  } catch (err) {
    console.error('Error handling message:', message, err);
    sendResponse({ success: false, error: err.message });
  }
}
