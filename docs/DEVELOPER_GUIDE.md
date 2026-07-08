# Praescius Developer & Architecture Guide

Welcome to the Praescius developer documentation. This document details the internal data flows, state management, and plugin architecture of the extension to help you build new indicators, UI components, or broker plugins.

## 1. System Data Flow

Praescius intercepts live market data directly from the host web page using an isolated world bridge. 

1. **`inject.js` (Main World):** Overwrites the global `window.WebSocket` constructor to intercept raw binary/text frames from charting engines (like Quotex or TradingView). It also profiles the global `window` object to detect `PIXI`, `cc` (Cocos2d), and Canvas instances.
2. **`content.js` (Isolated World):** Listens to `window.postMessage` events fired by `inject.js`. It acts as a bridge, relaying the raw frames to the background service worker via `chrome.runtime.sendMessage`. It also maintains a secondary DOM scraper fallback.
3. **`background/router.js` (Service Worker):** Receives the `WS_FRAME` and passes it to the `TickAggregator`. 
4. **`core/TickAggregator.js`**: Reassembles raw ticks into standard OHLCV candles (1-minute by default) using time-based bucketing. Once a candle completes, it writes to `IndexedDB` and emits a `market.candle.v1` event via the Event Bus.
5. **`ui/portfolio.js` & `ui/panels/`**: The frontend UI listens to runtime messages (like `CANDLE_UPDATE`). It queries `IndexedDB` for historical candles, runs indicator math, and updates the DOM.

## 2. Event Bus Channels

The `core/eventBus.js` module implements a Pub/Sub pattern. Core channels include:
* `market.tick.v1`: Raw tick price updates.
* `market.candle.v1`: Completed OHLCV candles.
* `market.rule.trigger.v1`: Dispatched when the Rules DSL engine matches a true condition.
* `system.logs.v1`: Core diagnostic logging (visible in the Developer Panel).

## 3. Adding a New Technical Indicator

All technical indicators are defined in `core/evaluator.js` under `INDICATOR_PLUGINS`. To add a new indicator (e.g., Stochastic Oscillator):

1. Open `core/evaluator.js`.
2. Add a new object to the `INDICATOR_PLUGINS` dictionary:
```javascript
Stochastic: {
  calculate: (candles, params) => {
    // Math logic using candles array (high, low, close)
    return resultsArray; 
  }
}
```
3. The Rules DSL (`core/compiler.js`) will automatically be able to parse `WHEN Stochastic < 20 THEN Notify` because it dynamically registers all keys in `INDICATOR_PLUGINS`.

## 4. The Web3 Bridge Architecture

Because Chrome Extension pages (`options.html`) do not have access to MetaMask (`window.ethereum`), we bridge the connection:
1. `options.html` runs inside an iframe on the host webpage.
2. User clicks "Connect Wallet" -> `portfolio.js` sends `window.parent.postMessage({ type: 'CONNECT_WALLET' })`.
3. `content.js` intercepts it, forwards it down to `inject.js` (Main World).
4. `inject.js` calls `window.ethereum.request(...)` and passes the resulting address back up the chain.

## 5. Adding a Broker Plugin

Brokers are defined in the `plugins/` directory. To add support for a new charting platform:
1. Create `plugins/mybroker/manifest.json`.
2. Define the URL match patterns and the data standardizer script (`provider.js`).
3. Ensure `provider.js` exports a class extending `BaseProvider` that knows how to decode the specific WebSocket frame format used by that broker.
