# Aetheris Market Observer — Master Documentation

Welcome to the comprehensive master documentation for **Aetheris Market Observer (V2)**, a state-of-the-art, high-performance, and **strictly observational** Chrome Extension (Manifest V3) designed to observe, record, and analyze real-time market data across multiple financial web charting platforms.

---

## 1. Project Overview & Vision

Aetheris Market Observer was created to bridge financial charting interfaces with logical rule engines and artificial intelligence. Unlike traditional trading bots, Aetheris is **completely read-only** (observation-only). It interacts with pages by hooking raw data streams, computing advanced technical analysis indicators, and translating natural language user commands into running indicator rules.

By migrating from a single-broker system (Quotex V1) to a decoupled plugin architecture (Aetheris V2), the extension can now match and observe any Web-based charting system, including public exchanges, retail brokers, and charting libraries.

---

## 2. Key Capabilities

* **Multi-Broker Compatibility**: Scans active tabs and automatically matches parsing engines (e.g. Quotex, Binance, TradingView) to translate native WebSocket frames.
* **Natural Language Rules Compiler**: Translates user-written prompts (e.g. *"Alert me if SMA 50 crosses above EMA 100 on BTC"*) into validated indicator criteria using Google Gemini, OpenAI, or local regex search fallbacks.
* **Pluggable Indicator Suite**: Evaluates technical metrics (SMA, EMA, RSI, MACD, ATR, VWAP) and candlestick patterns on sliding window caches in real time.
* **Event-Driven Brokerage Bus**: Uses a decoupled Event Bus pattern to handle packet decode cycles, log updates, rule evaluations, and system notifications without creating tight module dependencies.
* **High-Performance Storage**: Recalls historical candlesticks from IndexedDB database stores and provides JSON Lines (JSONL) data exports for analytical test procedures.
* **Offline Replay Simulator**: Simulates active WebSocket ticks from historical data files, allowing complete alert verification without live internet connections.
* **Interactive Developer Console**: Tracks raw socket streams, parsed candle series objects, database writes, and engine latencies from a secondary dashboard.

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
│
├── core/
│   ├── eventBus.js                # Singleton publish-subscribe broker
│   ├── compiler.js                # Sanitizes LLM outputs against logic schemas
│   ├── evaluator.js               # Tracks cache streams and executes indicators
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

## 4. Module Architecture Walkthrough

### A. Interception Bridge (`inject.js` & `content.js`)
* `inject.js` runs in the main world context of target pages. It wraps the native `WebSocket` API constructor, capturing both incoming and outgoing packet parameters without interrupting the main application. It uses `window.postMessage` to pass raw messages to `content.js`.
* `content.js` runs in an isolated extension context. It captures messages from `inject.js`, checks origin validity, and relays them to the background worker using `chrome.runtime.sendMessage`.

### B. Core Event Bus (`core/eventBus.js`)
Coordinates message handling in the background service worker:
* `network:ws_raw`: Fired when a raw frame is received. `providerManager` intercepts and parses it.
* `network:parsed_candle`: Fired when a parser resolves a candlestick. `logger.js` writes it to IndexedDB, and `evaluator.js` processes running technical rules.
* `logs:system`: Logs system updates and events to storage.
* `rule:triggered`: Emitted when active technical conditions match. This triggers `notifier.js` to show a desktop notification.

### C. Providers Layer (`providers/`)
Inherits from `BaseProvider`. Dynamically routes packets to active parsing engines:
* **Quotex**: Decodes Engine.IO / Socket.IO packet wrappers and standardizes price quotes.
* **Binance**: Decodes public Binance kline (`@kline_1m`) and mini-ticker events.
* **Scaffolds**: Stubs exist for TradingView, Deriv, Pocket Option, Bybit, OKX, and MT5 to outline discovery checks and symbol definitions.

### D. Pluggable Indicators (`indicators/`)
Indicators inherit from `BaseIndicator`. They compute standard calculations over the sliding window cache:
* `SMA` / `EMA`: Computes moving averages over user-specified periods.
* `RSI`: Calculates momentum based on gains/losses.
* `MACD`: Resolves MACD, signal lines, and histograms.
* `ATR`: Calculates volatility using true ranges.
* `VWAP`: Computes volume-weighted average price points.

### E. AI Translators (`ai/`)
Translates user instructions into structured JSON configurations:
* **Gemini**: Calls `gemini-1.5-flash` in JSON output mode.
* **OpenAI**: Calls `gpt-4o-mini` with structured JSON parameters.
* **Local**: Uses regex keywords to map queries without network access or API keys.

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
2. Go to the **Dashboard** tab, enter a test condition (e.g., *"Notify if RSI is greater than 70"*), and click **Compile & Save Rule**.
3. Return to the **Developer Panel** tab and click **Play**.
4. The simulator will stream historical candles into the event bus. When the condition matches, a browser notification will fire.
5. You can view the live output in the developer logs section at the bottom.
