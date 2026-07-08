/**
 * Event Bus subscriptions and calculations.
 */
import { eventBus } from '../core/eventBus.js';
import { providerManager } from '../providers/providerManager.js';
import { compileRule } from '../core/compiler.js';
import { evaluateRule, getMLConfidenceReport } from '../core/evaluator.js';
import { showNotification } from '../core/notifier.js';
import { aiManager } from '../ai/aiManager.js';
import { stateMachine } from '../core/stateMachine.js';
import { telemetry } from '../core/telemetry.js';
import RSI from '../indicators/RSI.js';
import EMA from '../indicators/EMA.js';
import SMA from '../indicators/SMA.js';
import MACD from '../indicators/MACD.js';
import ConsensusEngine from '../engine/ConsensusEngine.js';
import AlertEngine from '../engine/AlertEngine.js';
import { getDB } from './lifecycle.js';
import {
  sessions,
  candleCache,
  ruleCooldowns,
  latestWsPrices,
  adaptiveConfidences,
  activeBuildingCandles,
  globalState
} from './state.js';

const aggregationThrottle = {};

const rsiCalculator = new RSI();
const emaCalculator = new EMA();
const smaCalculator = new SMA();
const macdCalculator = new MACD();

const alertEngine = new AlertEngine(showNotification, (event, data) => eventBus.publish(event, data));

const CACHE_LIMIT = 200;
const COOLDOWN_MS = 60 * 1000;

function aggregateTickTo1m(tick) {
  if (tick.timeframe !== 'tick') return null;

  const tabId = tick.tabId || 'default';
  const symbol = tick.symbol;
  const key = `${tabId}_${symbol}`;
  const now = tick.timestamp;
  
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
    building.high = Math.max(building.high, tick.price);
    building.low = Math.min(building.low, tick.price);
    building.close = tick.price;
    building.price = tick.price;
    building.volume += tick.volume || 0;
  }

  return { ...building };
}

function evaluateActiveRules(symbol, timeframe, tabId, isHistorical) {
  if (isHistorical) return;

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
  if (isHistorical) return;

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

export function registerEventHandlers() {
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
        candle.source = candle.source || 'ws';
        candle.confidence = candle.confidence || 1.0;
        candle.tabId = event.tabId || 'default';
        candle.provider = provider.name;

        eventBus.publish('market.candle.v1', candle);

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
        
        console.log(`[Praescius Validation] ${symbol} | WS: ${lastWs.price} | DOM: ${candle.price} | Delta: ${delta.toFixed(4)} (${(pctDelta * 100).toFixed(4)}%)`);
        
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

    if (globalState.appLogger) {
      await globalState.appLogger.logTickComparison(symbol, candle.price, candle.source || 'ws', candle.confidence || 1.0, candle.provider, tabId);
    }

    if (!candleCache[key]) {
      candleCache[key] = [];
    }

    const cache = candleCache[key];
    const lastIndex = cache.length - 1;

    if (lastIndex >= 0 && cache[lastIndex].timestamp === candle.timestamp) {
      cache[lastIndex] = candle;
    } else {
      if (lastIndex >= 0 && tf !== 'tick') {
        const completedCandle = cache[lastIndex];
        chrome.storage.local.get(['settings'], async (res) => {
          if (res.settings?.loggingEnabled !== false && globalState.appLogger) {
            await globalState.appLogger.logCandle(completedCandle);
          }
        });
      }

      cache.push(candle);
      if (cache.length > CACHE_LIMIT) {
        cache.shift();
      }
      
      if (tf === 'tick') {
        chrome.storage.local.get(['settings'], async (res) => {
          if (res.settings?.loggingEnabled !== false && globalState.appLogger) {
            await globalState.appLogger.logCandle(candle);
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

    if (tf === 'tick') {
      const aggKey = `${tabId}_${symbol}`;
      const now = Date.now();
      if (!aggregationThrottle[aggKey] || now - aggregationThrottle[aggKey] > 1000) {
        aggregationThrottle[aggKey] = now;
        const aggregated1m = aggregateTickTo1m(candle);
        if (aggregated1m) {
          eventBus.publish('market.candle.v1', aggregated1m);
        }
      }
    }
  });

  // 3. System Log event handler
  eventBus.subscribe('system.logs.v1', async (log) => {
    console.log(`[EventBus Log][${log.type}] ${log.message}`);
    if (globalState.appLogger) {
      await globalState.appLogger.logSystemEvent(log.message, log.type, log.provider || 'system', log.tabId || 'default');
    }
  });

  // 4. State changed dispatcher
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
}
