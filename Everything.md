# Praescius (V2) - The "Everything" File

This document serves as the absolute master reference for the Praescius codebase. It is designed to be provided to Large Language Models (LLMs) or new developers to instantly grasp the entire scope, architecture, design system, and capabilities of the extension.

## 1. Project Overview
**Name:** Praescius by Nanduri Labs (Formerly Aetheris Market Observer)
**Type:** Chrome Extension (Manifest V3)
**Primary Goal:** To intercept live market data from web-based trading platforms (like Quotex, PocketOption, TradingView) entirely offline, reconstruct the data into OHLCV candles, and run quantitative indicators to notify the user of technical setups.
**Strict Rule:** The extension is 100% observational. It does not place trades or interact with the DOM to click buttons.

## 2. Directory Structure & Key Files

*   **`manifest.json`**: The V3 manifest. Grants permissions for `storage`, `scripting`, `notifications`, and host permissions `<all_urls>`.
*   **`inject.js`**: Injected into the MAIN world context. Hooks `window.WebSocket` to intercept frames. Handles Web3 `window.ethereum` bridge connections.
*   **`content.js`**: Runs in the ISOLATED world. Relays messages between `inject.js` and the Service Worker using `window.postMessage`. Injects the Neobrutalist UI sidebar iframe.
*   **`background.js`**: The main entry point for the Service Worker.
*   **`background/router.js`**: Handles all runtime messages (`WS_FRAME`, `CONNECT_WALLET`, `GET_STATUS`).
*   **`core/TickAggregator.js`**: Reassembles raw WebSocket ticks into 1-minute OHLCV candles and pushes them to IndexedDB.
*   **`core/compiler.js`**: The Rules DSL compiler. Translates English strings ("WHEN RSI > 70 THEN Notify") into a JSON AST structure.
*   **`core/evaluator.js`**: The math engine. Contains `INDICATOR_PLUGINS` (EMA, SMA, RSI, MACD, etc.). Evaluates the compiled rules against historical candle arrays.
*   **`core/replay.js`**: The Replay Simulator. Reads offline `candles.jsonl` files and streams them into the aggregator to backtest rules without a live connection.
*   **`storage/db.js`**: Wrapper for standard `IndexedDB` operations to store historical candles permanently.
*   **`ui/options.html`**: The massive frontend dashboard. Acts as both the standalone Settings page and the injected Sidebar UI. 
*   **`ui/portfolio.js`**: The core controller for the UI Hub. Handles math for the Correlation Matrix, Backtester, and Paper Trading Wallet.
*   **`ui/panels/AICoachPanel.js`**: The dedicated AI module. Handles the One-Click Checklist, Emotion Detector, ForexFactory News API, and real-time live trading coach.

## 3. The Neobrutalist Design System

Praescius uses a strict "Neobrutalist" aesthetic, defined in `ui/popup.css` and `ui/options.css`. 
*   **Colors:** Deep Space Black (`#0a0d14`), Aetheris Cyan (`#00f2fe`), Matrix Green (`#00e676`), Warning Red (`#ff1744`).
*   **Borders:** Heavy, solid 2px black borders (`border: 2px solid #000`).
*   **Shadows:** Hard, unblurred shadows (`box-shadow: 4px 4px 0px #000000`).
*   **Fonts:** Inter and monospace types for raw data output.
*   **Layout:** Glassmorphism (`rgba(255,255,255,0.02)`) over black backgrounds to create a hacker/terminal feel.

## 4. The AI Coach & Discipline Hub

The most advanced feature suite in V2. Contains 10 functional modules:
1.  **AI Trade Assistant:** Calculates live EMA/RSI to grade setups.
2.  **One-Click Checklist:** Disables trade execution until technical factors are confirmed.
3.  **Emotion Detector:** Reads the `praescius_journal` local storage. If 5+ trades occur in 20 mins, flashes red and calculates the degraded win rate.
4.  **Personal Stats:** Analyzes the paper-trading journal to determine if the user is better at longs vs shorts.
5.  **AI Auto-Journal:** Generates contextual reviews of the last closed trade.
6.  **Multi-Chart Scanner:** Cycles through the user's Watchlist in the background, hunting for RSI divergences.
7.  **Session Assistant:** Calculates UTC overlaps for London/NY/Tokyo forex sessions.
8.  **News Impact Filter:** Fetches the `faireconomy.media/ff_calendar_thisweek.json` API entirely in the background, caches it, and warns the user if a High Impact event is dropping in the next 4 hours.
9.  **Replay Mistakes:** Links to the Developer Replay simulator.
10. **Live Coach:** Analyzes live volume and EMA deviation to warn against entering bad trades.

## 5. Web3 Wallet Integration

Praescius features a secure, isolated-world bridging system to allow users to connect MetaMask, despite the UI running in an extension context.
*   `portfolio.js` sends a message to `window.parent` out of the sidebar iframe.
*   `content.js` catches it, relays it to `inject.js`.
*   `inject.js` fires `window.ethereum.request({method: 'eth_requestAccounts'})`.
*   The resulting wallet address is relayed all the way back up to the frontend UI.

## 6. Local Storage Keys

The extension relies on `chrome.storage.local` and `IndexedDB` (Database: `PraesciusDB`).
*   `rules`: Array of compiled DSL rules.
*   `settings`: User configs (Gemini API keys, notification sound toggles).
*   `praescius_balance`: The user's paper trading USD balance.
*   `praescius_positions`: Active paper trading positions.
*   `praescius_journal`: Closed paper trade history log.
*   `ff_news_cache`: Cached JSON array from ForexFactory.
*   `ff_news_time`: UNIX timestamp of the last news fetch.

*Use this document as context when generating new features or debugging the architecture.*
