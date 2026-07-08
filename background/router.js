/**
 * Runtime Message Router.
 */
import { eventBus } from '../core/eventBus.js';
import { providerManager } from '../providers/providerManager.js';
import { compileRule, parseDSL } from '../core/compiler.js';
import { showNotification } from '../core/notifier.js';
import { aiManager } from '../ai/aiManager.js';
import { stateMachine } from '../core/stateMachine.js';
import { telemetry } from '../core/telemetry.js';
import { ReplayEngine } from '../core/replay.js';
import { getLogs } from '../storage/db.js';
import { getDB } from './lifecycle.js';
import { tickAggregator } from '../core/TickAggregator.js';
import {
  sessions,
  globalState
} from './state.js';

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
    this.state = 'OFFLINE';
    this.replayEngine = new ReplayEngine(tabId);
  }
}

export function getSession(tabId) {
  const tid = tabId || 'default';
  if (!sessions[tid]) {
    sessions[tid] = new Session(tid);
  }
  return sessions[tid];
}

const COMMAND_HANDLERS = {
  'TOGGLE_KILL_SWITCH': async (message, sender, sendResponse, database) => {
    globalState.killSwitch = !globalState.killSwitch;
    sendResponse({ success: true, killSwitch: globalState.killSwitch });
  },
  'CLOSE_SIDEBAR': async (message, sender, sendResponse, database) => {
    chrome.storage.local.set({ sidebarOpen: false }, () => {
      if (sender.tab && sender.tab.id) {
        chrome.tabs.sendMessage(sender.tab.id, { action: 'SET_SIDEBAR_STATE', open: false }, () => {
          if (chrome.runtime.lastError) {}
        });
      }
    });
    sendResponse({ success: true });
  },
  'LOG_EVENT': async (message, sender, sendResponse, database) => {
    const logTabId = sender.tab ? sender.tab.id : 'default';
    eventBus.publish('system.logs.v1', {
      message: message.message,
      type: message.type || 'info',
      provider: message.provider || 'content_script',
      tabId: logTabId
    });
    sendResponse({ success: true });
  },
  'GET_MY_TAB_ID': async (message, sender, sendResponse, database) => {
    const tabId = sender.tab ? sender.tab.id : 'default';
    sendResponse({ success: true, tabId: tabId });
  },
  'GET_ACTIVE_SESSION_ID': async (message, sender, sendResponse, database) => {
    let activeTabId = Object.keys(sessions).find(id => {
      const state = sessions[id].state;
      return state === 'LIVE_WS' || state === 'LIVE_DOM' || state === 'REPLAY';
    });
    if (!activeTabId) activeTabId = sender.tab ? sender.tab.id : 'default';
    sendResponse({ success: true, tabId: activeTabId });
  },
  'WS_FRAME': async (message, sender, sendResponse, database) => {
    const wsTabId = sender.tab ? sender.tab.id : 'default';
    const wsUrl = sender.tab ? sender.tab.url : message.url;
    const wsTitle = sender.tab ? sender.tab.title : '';
    const wsDirection = message.direction || 'incoming';

    const wsProvider = providerManager.getProviderForUrl(wsUrl, wsTitle);
    if (wsProvider) {
      providerManager.activeProvider = wsProvider;
      const session = getSession(wsTabId);
      session.providerName = wsProvider.name;
      session.state = 'LIVE_WS';
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
      if (chrome.runtime.lastError) {}
    });

    sendResponse({ success: true });
  },
  'DOM_TICK': async (message, sender, sendResponse, database) => {
    const domTabId = sender.tab ? sender.tab.id : 'default';
    const domUrl = sender.tab ? sender.tab.url : '';
    const domTitle = sender.tab ? sender.tab.title : '';
    
    const domProvider = providerManager.getProviderForUrl(domUrl, domTitle);
    if (domProvider) {
      providerManager.activeProvider = domProvider;
      const session = getSession(domTabId);
      session.providerName = domProvider.name;
      session.state = 'LIVE_DOM';
    }

    const domPrice = Number(message.price);
    const domCandle = {
      schema: 1,
      provider: domProvider ? domProvider.name : 'dom_fallback',
      tabId: domTabId,
      symbol: message.symbol || 'EUR/USD',
      timestamp: Number(message.timestamp || Date.now()),
      open: domPrice, high: domPrice, low: domPrice, close: domPrice, price: domPrice,
      volume: 0, timeframe: 'tick',
      source: message.source || 'dom_selector',
      confidence: Number(message.confidence || 0.8)
    };
    
    eventBus.publish('market.candle.v1', domCandle);
    sendResponse({ success: true });
  },
  'GET_PROVIDER_SELECTORS': async (message, sender, sendResponse, database) => {
    const matchingProvider = providerManager.providers.find(p => p.matches(message.url, ''));
    sendResponse({ success: !!matchingProvider, selectors: matchingProvider ? matchingProvider.selectors : [] });
  },
  'DISCOVERY_REPORT': async (message, sender, sendResponse, database) => {
    const discTabId = sender.tab ? sender.tab.id : 'default';
    const sessionDisc = getSession(discTabId);
    sessionDisc.latestDiscovery = message.data;
    if (tickAggregator.streams.size > 0) sessionDisc.latestDiscovery.candlesFound = true;
    sendResponse({ success: true });
  },
  'GET_STATUS': async (message, sender, sendResponse, database) => {
    const statusTabId = message.tabId || 'default';
    const sessionStatus = getSession(statusTabId);
    
    const stats = globalState.appLogger ? await globalState.appLogger.getStats() : { totalLogged: 0 };
    const logs = await getLogs(database, 30, statusTabId);
    
    let latestCandle = null;
    for (const stream of tickAggregator.streams.values()) {
      const c = stream.currentCandle;
      if (c && (!latestCandle || c.timestamp > latestCandle.timestamp)) {
        latestCandle = c;
      }
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
      killSwitch: globalState.killSwitch,
      replayState: {
        isPlaying: activeReplay.isPlaying,
        currentIndex: activeReplay.currentIndex,
        totalCandles: activeReplay.candles ? activeReplay.candles.length : 0
      }
    });
  },
  'TRANSLATE_RULE': async (message, sender, sendResponse, database) => {
    const promptText = String(message.prompt || '').trim();
    if (promptText.toUpperCase().startsWith('WHEN')) {
      try {
        const compiledRule = parseDSL(promptText);
        sendResponse({ success: true, rule: compiledRule });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return;
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
  },
  'REPLAY_COMMAND': async (message, sender, sendResponse, database) => {
    const rTabId = message.tabId || 'default';
    const session = getSession(rTabId);
    const activeReplayEngine = session.replayEngine;

    if (message.command === 'load') activeReplayEngine.loadCandles(message.data);
    else if (message.command === 'start') activeReplayEngine.start(message.speed);
    else if (message.command === 'pause') activeReplayEngine.pause();
    else if (message.command === 'stop') activeReplayEngine.stop();
    else if (message.command === 'step') activeReplayEngine.step();

    sendResponse({
      success: true,
      replayState: {
        isPlaying: activeReplayEngine.isPlaying,
        currentIndex: activeReplayEngine.currentIndex,
        totalCandles: activeReplayEngine.candles.length
      }
    });
  },
  'TEST_NOTIFICATION': async (message, sender, sendResponse, database) => {
    showNotification('Praescius Test Alert', 'Observer connection and notifier are working correctly!');
    sendResponse({ success: true });
  }
};

export async function handleRuntimeMessage(message, sender, sendResponse) {
  try {
    const database = await getDB();
    const handler = COMMAND_HANDLERS[message.action];
    
    if (handler) {
      await handler(message, sender, sendResponse, database);
    } else {
      sendResponse({ success: false, error: `Unknown action: ${message.action}` });
    }
  } catch (err) {
    console.error('Error handling message:', message, err);
    sendResponse({ success: false, error: err.message });
  }
}
