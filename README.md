# Aetheris Market Observer (V2)

Aetheris Market Observer is an extensible, high-performance, and **strictly observational** Chrome Extension (Manifest V3) designed to observe, parse, and analyze real-time market data directly from financial web charting applications and notify users when user-defined technical conditions are met.

> [!IMPORTANT]
> **Observation-Only Rule**: This extension is read-only. It does **not** make trades, place binary options orders, click buy/sell execution elements, bypass platform checks, or interact with financial transaction services.

---

## What It Does & How It Works

### 1. What It Does
Aetheris tracks live asset streams (such as `BTC/USD` or `EUR/USD`) on active broker tabs. It logs candlestick data, evaluates technical indicators (RSI, SMA, EMA, MACD, ATR, VWAP), checks for specific candlestick patterns (Doji, Hammer, Engulfing), and generates system notifications when rules match. Users create rules in plain natural language or using the structured **Rules DSL**, which the extension compiles and validates locally.

### 2. Core Architecture
* **State Machine (`core/stateMachine.js`)**: Tracks execution states as a single source of truth (`OFFLINE`, `CONNECTING`, `LIVE_WS`, `LIVE_DOM`, `REPLAY`, `ERROR`).
* **Versioned Event Bus (`core/eventBus.js`)**: Decouples components by routing actions over structured channels:
  * `market.tick.v1` — Decoded web-socket ticks
  * `market.candle.v1` — Standardized OHLCV candles
  * `market.rule.trigger.v1` — Dispatched when technical conditions evaluate to true
  * `market.ai.summary.v1` — AI-generated notification summaries
  * `provider.connected.v1` / `provider.disconnected.v1` — Broker provider connection status
  * `system.state.changed.v1` — Internal state updates
  * `system.logs.v1` — Core diagnostics logger
* **Dynamic WebSocket Interception**: Captures socket traffic via an injected main-world script (`inject.js`) and forwards it to the content script using HTML5 `postMessage`.
* **Dynamic Plugin SDK**: External platforms can be registered as self-contained directories under `plugins/{key}/` containing a `manifest.json`, `provider.js`, and `selectors.json`, loaded dynamically via native ESM imports.
* **Historical Validation & Adaptive Confidence**: Compares real-time WebSocket ticks against DOM fallbacks, adjusting the confidence weighting dynamically based on price agreement ($\Delta = |P_{\text{ws}} - P_{\text{dom}}|$).
* **Multi-Dimensional ML Confidence System**: Generates a unified confidence report based on Prediction, Data Source, Rule structure, and Cache-based Historical success rates.
* **Performance Telemetry Diagnostics**: Logs execution metrics including WS/DOM uptime, frame parsing speeds, AI summarizer response times, selector errors, and replay execution latency.
* **Deterministic Simulation Player**: An offline Replay Engine (`core/replay.js`) parses historical JSON Lines (`logs/candles.jsonl`) to simulate streaming market data for dry-run verification.

---

## Rules DSL (Offline Compiler)
You can write structured rule conditions beginning with `WHEN` to compile rules instantly offline:
```text
WHEN
  RSI < 30
  AND
  EMA9 crosses above 100
THEN
  Notify
```
* **Supported Indicators**: `Price`, `RSI`, `SMA`, `EMA`, `MACD`, `ATR`, `VWAP`
* **Supported Operators**: `>`, `<`, `>=`, `<=`, `==`, `crosses above`, `crosses below`
* **Supported Patterns**: `Three Bullish Candles`, `Three Bearish Candles`, `Bullish Engulfing`, `Bearish Engulfing`, `Doji`, `Hammer`

---

## Installation & Setup

1. Clone or download this project directory to your local system.
2. Open Google Chrome and go to `chrome://extensions/`.
3. Toggle the **Developer mode** switch (top-right).
4. Click **Load unpacked** (top-left) and select this project directory.
5. The extension is now loaded and available in the extensions toolbar.

---

## Obtaining a Free Gemini API Key

Aetheris uses the Gemini API to translate natural language rules into structured JSON. You can set up your own API key for free:

### 1. How to Fetch an API Key
1. Navigate to [Google AI Studio](https://aistudio.google.com/).
2. Sign in with a standard Google account.
3. Click the blue **"Get API Key"** button in the left sidebar menu.
4. Click **"Create API Key"** (you can bind it to a new or existing Google Cloud project).
5. Copy your generated API key.
6. Open the extension popup, click the **Gear Icon** (Settings) in the top-right, choose **Google Gemini API**, paste your key, and click **Save Configuration**.

### 2. Supported Models & Free Tier Details
* **Recommended Model**: `gemini-1.5-flash`
* **Pricing**: Completely free.
* **Rate Limits**: The free tier allows up to **15 Requests Per Minute (RPM)**, **1,500 Requests Per Day (RPD)**, and **1 million Tokens Per Minute (TPM)**, which is more than sufficient for rule translations.

---

## Running Replay Simulations (Offline Testing)

To verify the rules engine and notifications without opening live charts:
1. Open the extension popup and switch to the **Developer Panel** tab.
2. Click **Load Simulation Dataset**. The replay tracker will load candles from `logs/candles.jsonl`.
3. Switch back to the **Dashboard** tab and type a test prompt or write DSL, for example:
   ```text
   WHEN
     RSI > 70
   THEN
     Notify
   ```
4. Click **Compile & Save Rule**.
5. Return to the **Developer Panel** tab and click **Play**.
6. The simulator will stream candles into the event pipeline. When the condition matches, a browser notification alert will trigger.
7. Review raw frames, parsed streams, and live performance metrics inside the panels below the player controls.
