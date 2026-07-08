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
  ruleCooldowns,
  latestWsPrices,
  adaptiveConfidences,
  activePositions,
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

import { tickAggregator } from '../core/TickAggregator.js';

function evaluateActiveRules(symbol, tabId, isHistorical = false) {
  if (isHistorical || globalState.killSwitch) return;
  const cache = tickAggregator.getCandles(symbol);
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
        const trend = latestPrice > cache[Math.max(0, cache.length - 5)].close ? 'bullish' : 'bearish';
        
        let rsi = null, ema9 = null, ema21 = null, sma20 = null, macd = null;
        try { const r = rsiCalculator.calculate(cache, { period: 14 }).pop(); if (typeof r === 'number') rsi = Number(r.toFixed(2)); } catch(e){}
        try { const e = emaCalculator.calculate(cache, { period: 9 }).pop(); if (typeof e === 'number') ema9 = Number(e.toFixed(2)); } catch(e){}
        try { const e = emaCalculator.calculate(cache, { period: 21 }).pop(); if (typeof e === 'number') ema21 = Number(e.toFixed(2)); } catch(e){}
        try { const s = smaCalculator.calculate(cache, { period: 20 }).pop(); if (typeof s === 'number') sma20 = Number(s.toFixed(2)); } catch(e){}
        try { 
          const m = macdCalculator.calculate(cache).pop(); 
          if (m && typeof m.macd === 'number') macd = { macd: Number(m.macd.toFixed(4)), signal: Number(m.signal.toFixed(4)), histogram: Number(m.histogram.toFixed(4)) };
        } catch(e){}

        const mlConfidence = getMLConfidenceReport(cache, rule, confidence);
        const summary = {
          symbol, trend, triggerRule: rule.name, lastPrice: latestPrice,
          confidence: mlConfidence.aggregateScore, mlConfidenceDetails: mlConfidence,
          timestamp: now,
          context: { last20Ticks: [], rsi, ema9, ema21, sma20, macd }
        };

        const provider = settings.aiProvider || 'local';
        const apiKey = provider === 'gemini' ? settings.geminiKey : provider === 'openai' ? settings.openaiKey : '';
        
        let alertText = '';
        const tStartNotif = performance.now();
        try {
          alertText = await aiManager.summarizeNotification(provider, apiKey, summary);
        } catch (e) {
          alertText = `Rule: "${rule.name}" met.\nPrice: ${latestPrice.toLocaleString()}\nTime: ${new Date().toLocaleTimeString()}`;
        }
        telemetry.recordNotificationLatency(performance.now() - tStartNotif);

        showNotification(`${symbol} [V2 Alert]`, alertText);

        activePositions[ruleId] = {
          entryPrice: latestPrice,
          direction: trend === 'bullish' ? 1 : -1,
          timestamp: now,
          symbol: symbol
        };

        eventBus.publish('market.rule.trigger.v1', { ruleId, ruleName: rule.name, symbol, price: latestPrice, mlConfidence, timestamp: now, tabId });
        eventBus.publish('market.ai.summary.v1', { ruleId, alertText, provider, timestamp: now, tabId });
        eventBus.publish('system.logs.v1', { message: `Rule triggered: "${rule.name}" (Aggregate Confidence: ${(mlConfidence.aggregateScore * 100).toFixed(0)}%)`, type: 'info', tabId, provider: latestCandle.provider || 'ws' });
      }
    }
  });
}

function evaluateCustomStrategies(symbol, tabId, isHistorical = false) {
  if (isHistorical || globalState.killSwitch) return;
  const cache = tickAggregator.getCandles(symbol);
  if (!cache || cache.length === 0) return;

  chrome.storage.local.get(['activeStrategies', 'settings'], (res) => {
    try {
      const consensusResult = ConsensusEngine.evaluate(cache, [], res.activeStrategies || {});
      alertEngine.process(tabId, symbol, '1m', consensusResult, res.settings || {});
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
      telemetry.recordProviderLatency(performance.now() - tStart);

      if (candle) {
        candle.source = candle.source || 'ws';
        candle.confidence = candle.confidence || 1.0;
        candle.tabId = event.tabId || 'default';
        candle.provider = provider.name;

        eventBus.publish('market.candle.v1', candle);

        if (event.tabId && event.tabId !== 'default') {
          chrome.tabs.sendMessage(event.tabId, { action: 'VALID_WS_TICK', timestamp: Date.now() }, () => { if (chrome.runtime.lastError) {} });
        }
      }
    } catch (err) {
      console.error('[Background] WS Parsing error:', err);
      telemetry.logSelectorFailure();
    }
  });

  // 2. Parsed Candle handler -> TickAggregator
  eventBus.subscribe('market.candle.v1', async (candle) => {
    const symbol = candle.symbol;
    const tabId = candle.tabId || 'default';

    if (candle.timeframe !== 'tick') {
      if (candle.source === 'replay_engine' || candle.isHistorical) {
        if (candle.source === 'replay_engine') {
          stateMachine.transitionTo('REPLAY');
          telemetry.endWsSession();
          telemetry.endDomSession();
        }
        
        tickAggregator.pushCompletedCandle(candle);
        
        chrome.runtime.sendMessage({
          action: 'CANDLE_UPDATE',
          candle: candle,
          tabId: tabId
        }, () => { if (chrome.runtime.lastError) {} });

        evaluateActiveRules(symbol, tabId, candle.isHistorical);
        evaluateCustomStrategies(symbol, tabId, candle.isHistorical);
      }
      return;
    }

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
      stateMachine.transitionTo('LIVE_WS');
      telemetry.startWsSession();
      telemetry.endDomSession();

      const wsPriceKey = `${tabId}_${symbol}`;
      latestWsPrices[wsPriceKey] = {
        price: candle.price,
        timestamp: Date.now()
      };
    }

    const { minuteChanged } = tickAggregator.onTick(candle);
    const latestCandle = tickAggregator.getLatestCandle(symbol);

    const stream = tickAggregator.streams.get(symbol);
    if (stream && stream.indicators && latestCandle) {
      latestCandle.ema9 = stream.indicators.ema9;
      latestCandle.ema21 = stream.indicators.ema21;
      latestCandle.regime = stream.indicators.regime;
    }

    chrome.runtime.sendMessage({
      action: 'CANDLE_UPDATE',
      candle: latestCandle,
      tabId: tabId
    }, () => { if (chrome.runtime.lastError) {} });

    if (minuteChanged) {
      const buffer = tickAggregator.getCandles(symbol);
      const completedCandle = buffer.length > 1 ? buffer[buffer.length - 2] : null;

      if (buffer.length > 21 && stream) {
        let ema9 = null, ema21 = null, rsi = null;
        try { ema9 = emaCalculator.calculate(buffer, { period: 9 }).pop(); } catch(e){}
        try { ema21 = emaCalculator.calculate(buffer, { period: 21 }).pop(); } catch(e){}
        try { rsi = rsiCalculator.calculate(buffer, { period: 14 }).pop(); } catch(e){}
        
        let regime = 'Neutral';
        if (rsi !== null) {
          if (rsi > 65) regime = 'Bull Trend (High Vol)';
          else if (rsi < 35) regime = 'Bear Trend (High Vol)';
          else regime = 'Ranging Chop (Low Vol)';
        }
        stream.indicators = { ema9, ema21, regime };
      }
      
      const now = Date.now();
      chrome.storage.local.get(['rules', 'settings'], async (res) => {
        const rules = res.rules || [];
        let rulesUpdated = false;
        
        for (const [rId, pos] of Object.entries(activePositions)) {
          if (now - pos.timestamp >= 5 * 60 * 1000) {
            const r = rules.find(ru => ru.id === rId);
            if (r && latestCandle) {
              const pnl = ((latestCandle.close - pos.entryPrice) / pos.entryPrice) * pos.direction * 100;
              r.stats = r.stats || { wins: 0, losses: 0, totalPnl: 0, maxDd: 0 };
              if (pnl > 0) r.stats.wins += 1;
              else r.stats.losses += 1;
              r.stats.totalPnl += pnl;
              if (pnl < r.stats.maxDd) r.stats.maxDd = pnl;
              rulesUpdated = true;
            }
            delete activePositions[rId];
          }
        }
        
        if (rulesUpdated) {
          chrome.storage.local.set({ rules });
        }

        if (res.settings?.loggingEnabled !== false && globalState.appLogger && completedCandle) {
          await globalState.appLogger.logCandle(completedCandle);
        }
      });

      evaluateActiveRules(symbol, tabId, false);
      evaluateCustomStrategies(symbol, tabId, false);
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
