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
Loads offline `.jsonl` candlestick recordings to simulate live WebSocket feeds. Useful for testing rule configurations without active page instances.
