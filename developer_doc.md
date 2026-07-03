# Developer Documentation - Aetheris Market Observer (V2)

This document covers the refactored, event-driven, multi-provider architecture of the extension.

---

## 1. Extension Architecture Diagram

```mermaid
graph TD
    subgraph MAIN World Context
        PW[Page WebSocket] -->|intercept| IW[inject.js WebSocket Hook]
        IW -->|window.postMessage| CS[content.js Bridge]
        
        subgraph Discovery Modules
            DC[discovery/discovery.js] -->|runs| CAN[canvas.js] & WS[websocket.js] & PIX[pixijs.js] & STO[storage.js] & GLO[globals.js]
        end
        DC -->|window.postMessage| CS
    end

    subgraph ISOLATED World Context
        CS -->|chrome.runtime.sendMessage| SW[background.js Service Worker]
    end

    subgraph Background Service Worker Context
        subgraph Core Event Bus
            EB[core/eventBus.js]
        end

        SW -->|WS_FRAME| EB
        SW -->|DISCOVERY_REPORT| EB

        subgraph Event Subscriptions
            EB -->|network:ws_raw| PM[providers/providerManager.js]
            PM -->|routes to| QP[providers/quotexProvider.js]
            QP -->|publishes parsed_candle| EB

            EB -->|network:parsed_candle| LOG[core/logger.js]
            LOG -->|saveCandle| DB[(storage/db.js IndexedDB)]

            EB -->|network:parsed_candle| EVAL[core/evaluator.js]
            EVAL -->|uses indicator plugins| IND[indicators/]
            EVAL -->|if trigger matches| EB
            
            EB -->|rule:triggered| NT[core/notifier.js]
            NT -->|fire alert| AN[Desktop Alerts]
        end

        subgraph Offline Simulation
            REP[core/replay.js Replay Engine] -->|parse JSONL logs| EB
        end
    end

    subgraph UI Panels (Popup / Options)
        PP[ui/popup.js] -->|GET_STATUS| SW
        PP -->|REPLAY_COMMAND| SW
        PP -->|TRANSLATE_RULE| SW
        
        SW -->|routes rule prompt| AIM[ai/aiManager.js]
        AIM -->|delegates to| GEM[ai/gemini.js] & OAI[ai/openai.js] & LOC[ai/local.js]
        AIM -->|returns JSON| COMP[core/compiler.js Validator]
        COMP -->|saves compiled rule| LSTO[(chrome.storage.local)]
    end
```

---

## 2. Decoupled Pipeline and Component Modules

### A. Core Event Bus (`core/eventBus.js`)
Rather than coupling modules directly, components publish and subscribe to events on a central singleton bus:
* `network:ws_raw` - Emitted when a new raw websocket frame is intercepted from the page.
* `network:parsed_candle` - Emitted when a frame is parsed into a uniform candle object.
* `logs:system` - Emitted for general system logging.

### B. Providers Layer (`providers/`)
Standardizes chart data parsing across different sites and brokers:
* `baseProvider.js` - Abstract class defining the provider pattern contract.
* `quotexProvider.js` - Implements the engine/socket headers decoder specific to Quotex.
* `providerManager.js` - Scans tab URLs to match and activate the appropriate parser.

### C. AI Translators (`ai/`)
Translates user instructions using multiple models or offline fallbacks:
* `baseAI.js` - Defines the LLM translation interface.
* `gemini.js` / `openai.js` - Handles cloud integrations.
* `local.js` - Simple string/regex keyword analyzer that operates offline without API keys.
* `aiManager.js` - Routes calls dynamically based on options configuration.

### D. Plugin Indicators (`indicators/`)
Calculates indicators using separate modular classes extending `BaseIndicator`:
* Available plug-ins: `SMA`, `EMA`, `RSI`, `MACD`, `ATR`, and `VWAP`.

### E. Rule Validator & Compiler (`core/compiler.js` & `core/evaluator.js`)
* `compiler.js` sanitizes AI output against supported patterns and types.
* `evaluator.js` processes compiled parameters over cached candles, calling the necessary indicator plug-ins dynamically.

### F. Replay Simulator (`core/replay.js` & `logs/`)
Loads offline `.jsonl` candlestick recordings to simulate live Feeds. Emitted candles flow through the standard Event Bus (`network:parsed_candle`) and trigger rule checks identically to live feeds.

---

## 3. Real-time Historical Validation Engine
When both active WebSocket (gold standard) and DOM fallback feeds are running concurrently for the same asset, the Service Worker calculates absolute price deltas:
$$\Delta = |P_{\text{ws}} - P_{\text{dom}}|$$
If the delta matches within $\leq 0.05\%$, validation passes, confirming DOM selector accuracy.

---

## 4. Adaptive Confidence Scoring Feedback Loop
Rather than hardcoding static confidence values (e.g. 0.8 for selector, 0.5 for title), the system dynamically updates source weightings:
*   **High Agreement ($\Delta < 0.05\%$)**: Increment confidence by $+0.001$, up to a maximum of $0.99$.
*   **Low Agreement ($\Delta > 0.5\%$)**: Decrement confidence by $-0.010$, down to a floor of $0.10$.
This lets the system adapt automatically to layout shifts or rendering artifacts.

---

## 5. Decoupled Provider DOM Selector Plugins
DOM Selectors are moved out of the content script and registered directly inside the constructor of each provider subclass (e.g., `this.selectors = [...]`). The content script queries these selectors dynamically via the `GET_PROVIDER_SELECTORS` messaging protocol, making it trivial to add support for new platforms by dropping in a new provider module.

---

## 6. Context-Aware AI Notification Summaries
Upon rule trigger, the Service Worker compiles a compact JSON technical summary window:
```json
{
  "symbol": "BTCUSD",
  "trend": "bullish",
  "triggerRule": "RSI > 70",
  "lastPrice": 108472.4,
  "confidence": 0.98,
  "timestamp": 17515248,
  "context": {
    "last20Ticks": [ ... ],
    "rsi": 72.15,
    "ema9": 108420.10,
    "ema21": 108390.50,
    "sma20": 108400.00,
    "macd": { "macd": 29.6, "signal": 25.1, "histogram": 4.5 }
  }
}
```
This summary is passed to Gemini or OpenAI to return a natural-language analysis of the trigger context in less than 25 words, preserving API tokens and reducing latency.

---

## 7. Future Predictive Machine Learning Layer
The compiled tick comparison log database serves as a high-density, structured dataset. Future iterations can feed this data to a local ML layer (TensorFlow.js or WebNN) to:
1.  **Estimate Trigger Success Probability**: Forecast the probability of a positive outcome following indicator crossovers.
2.  **Predict Micro-trend Reversals**: Train short-term classifiers to predict price action over the next 10-30 ticks.
3.  **Heuristically Filter Noise**: Filter out low-confidence anomaly price spikes before they hit the rule engine.
