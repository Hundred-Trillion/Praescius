# Aetheris Market Observer (V2)

Aetheris Market Observer is an extensible, high-performance, and **strictly observational** Chrome Extension (Manifest V3) designed to observe, parse, and analyze real-time market data directly from financial web charting applications (such as Quotex and others) and notify users when user-defined technical conditions are met.

> [!IMPORTANT]
> **Observation-Only Rule**: This extension is read-only. It does **not** make trades, place binary options orders, click buy/sell execution elements, bypass platform checks, or interact with financial transaction services.

---

## What It Does & How It Works

### 1. What It Does
Aetheris tracks live asset streams (such as `BTC/USD`) on active broker tabs. It logs candlestick data, evaluates technical indicators (RSI, SMA, EMA, MACD, ATR, VWAP), checks for specific candlestick patterns (Doji, Hammer, Engulfing), and generates system notifications when rules match. Users create rules in plain natural language (e.g., *"Notify me when RSI crosses below 30 and there is a Doji candle"*), which the extension translates and validates locally.

### 2. How It Works
* **Dynamic WebSocket Interception**: The extension injects a main-world capture script (`inject.js`) that wraps the global `window.WebSocket` constructor. This intercepts socket traffic and forwards it to the content script using HTML5 `postMessage`.
* **Event-Driven Architecture**: The background service worker listens to forwarded packets and broadcasts them over a central **Event Bus** (`core/eventBus.js`) to decouple components.
* **Abstracted Providers Layer**: Sub-parsers (`providers/`) decode specific message protocols (e.g. Socket.IO headers) and format them into a uniform data schema.
* **Modular Indicator Plugins**: Technical indicators are computed using dedicated classes (`indicators/`) inheriting from `BaseIndicator`.
* **Rule Compiler & Local Evaluator**: Natural language prompts are converted to JSON, validated by a validation module (`core/compiler.js`) to protect runtime integrity, and executed on the sliding candle cache.
* **Deterministic Simulation Player**: An offline Replay Engine (`core/replay.js`) parses historical JSON Lines (`logs/candles.jsonl`) to simulate streaming market data for dry-run verification.

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
3. Switch back to the **Dashboard** tab and type a test prompt, for example:
   * `Notify me if RSI is greater than 70`
4. Click **Compile & Save Rule**.
5. Return to the **Developer Panel** tab and click **Play**.
6. The simulator will stream candles into the event pipeline. When the condition matches, a browser notification alert will trigger.
7. Review raw frames and parsed streams inside the panels below the player controls.
