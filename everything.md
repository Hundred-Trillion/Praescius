# Aetheris Market Observer — Master Documentation

Welcome to the comprehensive master documentation for **Aetheris Market Observer (V2)**, a state-of-the-art, high-performance, and **strictly observational** Chrome Extension (Manifest V3) designed to observe, record, and analyze real-time market data across multiple financial web charting platforms.

---

## 1. Project Overview & Vision

Aetheris Market Observer was created to bridge financial charting interfaces with logical rule engines and artificial intelligence. Unlike traditional trading bots, Aetheris is **completely read-only** (observation-only). It interacts with pages by hooking raw data streams, computing advanced technical analysis indicators, and translating natural language user commands into running indicator rules.

By migrating from a single-broker system (Quotex V1) to a decoupled plugin architecture (Aetheris V2), the extension can now match and observe any Web-based charting system, including public exchanges, retail brokers, and charting libraries.

---

## 2. Key Capabilities

* **Multi-Broker Compatibility**: Scans active tabs and automatically matches parsing engines (e.g. Quotex, Binance, TradingView) to translate native WebSocket frames.
* **Versioned Event-Driven Pipeline**: Uses a decoupled Event Bus pattern to handle packet decode cycles, log updates, rule evaluations, and system notifications without creating tight module dependencies.
* **Unified State Machine**: A central state controller tracks current execution states (`OFFLINE`, `CONNECTING`, `LIVE_WS`, `LIVE_DOM`, `REPLAY`, `ERROR`) to provide a single source of truth.
* **Rules DSL (Offline Compiler)**: Offers instant natural-language compiler support beginning with `WHEN`, enabling fast condition registration without calling external cloud LLMs.
* **Dynamic Plugin SDK**: Third-party exchanges or charting engines can be dropped into the `plugins/` directory containing a manifest, JavaScript parser class, and custom DOM selectors.
* **Multi-Dimensional ML Confidence System**: Computes technical metrics to evaluate the reliability of active indicators, generating prediction scores, source weightings, and historical backtest win-rates.
* **Adaptive Selector Calibration**: Compares live WebSockets against DOM fallback selectors and dynamically updates confidence scores based on price variations.
* **Performance Telemetry Diagnostics**: Audits WS/DOM uptime, frame parsing speeds, AI summarizer response times, selector errors, and replay execution latency.
* **Offline Replay Simulator**: Simulates active WebSocket ticks from historical data files, allowing complete alert verification without live internet connections.
* **Interactive Developer Console**: Tracks raw socket streams, parsed candle series objects, database writes, and telemetry logs from a secondary dashboard.

---

## 3. Directory Layout

The codebase is organized as follows:

```
Aetheris Market Observer/
├── manifest.json                  # Manifest V3 extension configuration
├── background.js                  # Background service worker (Event Bus host)
├── content.js                     # Bridge content script (Isolated world)
├── inject.js                      # Websocket interception script (Main world)
├── developer_doc.md               # Dynamic flow charts and sequence diagrams
├── README.md                      # Quick-start installation instructions
├── everything.md                  # Master documentation (This file)
│
├── core/
│   ├── eventBus.js                # Singleton publish-subscribe broker
│   ├── stateMachine.js            # Unified execution state controller
│   ├── telemetry.js               # Performance metrics aggregator
│   ├── compiler.js                # Sanitizes LLM outputs and parses Rules DSL
│   ├── evaluator.js               # Tracks cache streams and executes indicators/ML reports
│   ├── logger.js                  # Manages IndexedDB writes and JSONL formatting
│   ├── notifier.js                # Triggers system alerts and push notifications
│   └── replay.js                  # Feeds historical files to simulate market data
│
├── providers/
│   ├── baseProvider.js            # Abstract provider prototype
│   ├── providerManager.js         # Routes incoming network streams to plugins
│   ├── quotex/                    # Quotex parsing plugin
│   ├── binance/                   # Binance stream plugin
│   ├── tradingview/               # TradingView hook template
│   ├── deriv/                     # Deriv API template
│   ├── pocketoption/              # Pocket Option template
│   ├── bybit/                     # Bybit V5 template
│   ├── okx/                       # OKX V5 template
│   └── mt5/                       # MetaTrader 5 template
│
├── plugins/
│   └── dummy/                     # Mock exchange plugin illustrating Plugin SDK
│       ├── manifest.json          # Plugin manifest descriptor
│       ├── provider.js            # Parser implementation class
│       └── selectors.json         # DOM query selectors
│
├── indicators/
│   ├── baseIndicator.js           # Abstract calculation template
│   ├── SMA.js                     # Simple Moving Average
│   ├── EMA.js                     # Exponential Moving Average
│   ├── RSI.js                     # Relative Strength Index
│   ├── MACD.js                    # Moving Average Convergence Divergence
│   ├── ATR.js                     # Average True Range (Wilder's)
│   └── VWAP.js                    # Volume Weighted Average Price
│
├── ai/
│   ├── baseAI.js                  # Abstract translation template
│   ├── aiManager.js               # Resolves prompts via configured models
│   ├── gemini.js                  # Google Gemini API connector
│   ├── openai.js                  # OpenAI GPT API connector
│   └── local.js                   # Keyword-matching regex translation fallback
│
├── discovery/
│   ├── discovery.js               # Aggregates results and returns metrics
│   ├── canvas.js                  # Audits canvas/WebGL contexts
│   ├── websocket.js               # Detects active sockets
│   ├── pixijs.js                  # Audits PixiJS variables
│   ├── storage.js                 # Evaluates database storages
│   └── globals.js                 # Profiles global namespaces
│
├── storage/
│   └── db.js                      # IndexedDB transactions (AetherisObserverDB)
│
├── ui/
│   ├── popup.html                 # Main popup UI (Dashboard & Developer tabs)
│   ├── popup.js                   # Popup tab/simulator controller
│   ├── options.html               # Config settings page (Keys & Toggles)
│   ├── options.js                 # Options state manager
│   └── design.css                 # Glassmorphism dark mode theme styling
│
├── logs/
│   ├── candles.jsonl              # Simulation candles database
│   └── websocket.jsonl            # Raw websocket simulation stream
│
└── icons/
    ├── icon16.png                 # Toolbar icon (16x16)
    ├── icon48.png                 # Toolbar icon (48x48)
    └── icon128.png                # Extension manager icon (128x128)
```

---

## 4. Architectural Deep-Dive

### A. Interception Bridge (`inject.js` & `content.js`)
* `inject.js` runs in the main world context of target pages. It wraps the native `WebSocket` API constructor, capturing both incoming and outgoing packet parameters without interrupting the main application. It uses `window.postMessage` to pass raw messages to `content.js`.
* `content.js` runs in an isolated extension context. It captures messages from `inject.js`, checks origin validity, and relays them to the background worker using `chrome.runtime.sendMessage`.

### B. Versioned Event Bus (`core/eventBus.js`)
Handles asynchronous communication inside the service worker using versioned channels:
* `market.tick.v1`: Fired when a raw frame is received. `providerManager` intercepts and parses it.
* `market.candle.v1`: Fired when a parser resolves a candlestick. `logger.js` writes it to IndexedDB, and `evaluator.js` processes running technical rules.
* `market.rule.trigger.v1`: Fired when active technical conditions match. 
* `market.ai.summary.v1`: Fired when Gemini/OpenAI completes a micro-trend notification summary.
* `system.state.changed.v1`: Broadcasts state machine transitions.
* `system.logs.v1`: Centralized diagnostics logger.

### C. State Machine Orchestration (`core/stateMachine.js`)
Manages execution transitions to ensure one source of truth:
* `OFFLINE` - Default idle state when no active brokers are matched.
* `CONNECTING` - Active discovery state checking selectors and hook points.
* `LIVE_WS` - Primary stream active decoding raw WebSocket packets.
* `LIVE_DOM` - Fallback stream active extraction price from page elements.
* `REPLAY` - Simulator mode active reading local JSONL files.
* `ERROR` - Halted state due to exceptions or network drop.

### D. Rules DSL Compiler (`core/compiler.js`)
Instantly parses natural-language syntax strings starting with `WHEN`:
* Translates indicators (RSI, EMA, etc.), operators (crosses above, crosses below, etc.), numeric comparison scalars, and candlestick patterns.
* Evaluates conditions locally on the background thread cache, eliminating network calls, latency, and cloud dependency for structured commands.

### E. Self-Contained Plugin SDK (`plugins/`)
Exposes a dynamic dynamic-load framework. When the background worker initializes, it queries folders under `/plugins/` via standard browser fetches:
* `manifest.json`: Defines plugin properties.
* `provider.js`: Exports the custom parser class extending `BaseProvider`.
* `selectors.json`: Custom array of DOM query fallbacks.

### F. Multi-Dimensional ML Confidence System (`core/evaluator.js`)
Calculates condition reliability:
1. **Prediction Confidence**: Derived from Relative Strength Index (RSI) proximity to extreme bounds, estimating trend continuity probability.
2. **Data Confidence**: Evaluates the reliability of the source feed (WebSocket: 1.0, DOM selector: 0.1–0.99, title fallback: 0.5).
3. **Rule Confidence**: Based on condition count and logical operator complexity.
4. **Historical Success Rate**: Back-runs the compiled conditions over the in-memory candlestick cache to calculate historical win-rate outcomes.

### G. Performance Telemetry Diagnostics (`core/telemetry.js`)
Measures runtime diagnostic statistics:
* WebSocket/DOM active connection uptimes.
* Frame decoding latencies (ms).
* LLM notification summary generation speed (ms).
* Cumulative selector extraction failures.
* Simulator tick processing speeds (ms).

---

## 5. Google Gemini API Setup (Free Tier)

Aetheris uses the Gemini API to parse natural language prompts. Follow these steps to obtain a free API key:

1. Visit [Google AI Studio](https://aistudio.google.com/).
2. Log in with your Google account.
3. Click **"Get API Key"** in the top left sidebar.
4. Click **"Create API Key"** and copy the generated key.
5. In the extension settings (popup Gear Icon), select **Google Gemini API**, paste the key, and click **Save Configuration**.

> [!TIP]
> The free tier model `gemini-1.5-flash` allows up to **15 Requests Per Minute (RPM)** and **1,500 Requests Per Day (RPD)**, which is completely free of charge and ideal for rule translations.

---

## 6. How to Run Replay Simulations

To test Aetheris offline using the built-in simulator:
1. Open the extension popup, go to the **Developer Panel** tab, and click **Load Simulation Dataset**. This loads mock candles from `logs/candles.jsonl`.
2. Go to the **Dashboard** tab, enter a test condition (e.g., *"Notify if RSI is greater than 70"* or write DSL starting with `WHEN`), and click **Compile & Save Rule**.
3. Return to the **Developer Panel** tab and click **Play**.
4. The simulator will stream historical candles into the event bus. When the condition matches, a browser notification will fire.
5. You can view the live output and real-time performance telemetry in the panels at the bottom.
