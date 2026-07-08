/**
 * Content Script (ISOLATED world context).
 * Bridges data channels and passes extension IDs to page contexts.
 */

// Helper to determine if extension context is still valid
function isContextValid() {
  try {
    return typeof chrome !== 'undefined' && !!chrome.runtime && !!chrome.runtime.getManifest();
  } catch (e) {
    return false;
  }
}

// Helper to safely send messages without throwing uncaught invalid context errors
function safeSendMessage(message, callback) {
  if (!isContextValid()) return;
  try {
    chrome.runtime.sendMessage(message, (response) => {
      try {
        if (chrome.runtime && chrome.runtime.lastError) {
          return;
        }
      } catch (e) {
        return;
      }
      if (callback) callback(response);
    });
  } catch (err) {
    // Suppress context invalidation errors
  }
}

// 1. Inject the extension asset path into the main page context
try {
  if (isContextValid()) {
    const seedScript = document.createElement('script');
    seedScript.textContent = `window.__PRAESCIUS_EXTENSION_URL__ = "${chrome.runtime.getURL('')}";`;
    (document.head || document.documentElement).appendChild(seedScript);
    seedScript.remove();
  }
} catch (err) {
  console.error('[Praescius_Content] Failed to seed extension URL:', err);
}

// 2. Listen to postMessage frames and relay to service worker
let lastWsMessageTime = Date.now();
let lastDomPrice = null;
let activeSelectors = [];

// Request provider selectors on startup
safeSendMessage({
  action: 'GET_PROVIDER_SELECTORS',
  url: window.location.href
}, (response) => {
  if (response && response.success && Array.isArray(response.selectors)) {
    activeSelectors = response.selectors;
    console.log('[Praescius Content] Loaded dynamic selectors from background:', activeSelectors);
  }
});

// Listen for messages from background (like valid WS ticks or sidebar toggling)
try {
  if (isContextValid()) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (!isContextValid()) return false;
      if (message.action === 'VALID_WS_TICK') {
        lastWsMessageTime = message.timestamp || Date.now();
        sendResponse({ success: true });
      } else if (message.action === 'SET_SIDEBAR_STATE') {
        initSidebar(message.open);
        sendResponse({ success: true });
      }
      return true;
    });
  }
} catch (err) {
  // ignore
}

window.addEventListener('message', (event) => {
  if (!isContextValid()) return;

  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;

  // Handle WebSocket raw frames
  if (msg.type === 'WS_FRAME') {
    safeSendMessage({
      action: 'WS_FRAME',
      direction: msg.direction,
      payload: msg.payload,
      url: msg.url,
      timestamp: Date.now()
    });
  }

  // Handle Discovery aggregations
  if (msg.type === 'DISCOVERY_REPORT') {
    safeSendMessage({
      action: 'DISCOVERY_REPORT',
      data: msg.data
    });
  }

  // Handle Web3 Wallet Bridge communication
  if (msg.source === 'praescius-iframe') {
    // Relay from iframe to page context (where inject.js is running)
    window.postMessage({
      source: 'praescius-bridge',
      type: msg.type,
      hexMessage: msg.hexMessage,
      account: msg.account
    }, '*');
  }

  if (msg.source === 'praescius-main-response') {
    // Relay from page context back to iframe
    if (sidebarIframe && sidebarIframe.contentWindow) {
      sidebarIframe.contentWindow.postMessage({
        ...msg,
        source: 'praescius-bridge-response'
      }, '*');
    }
  }
});

// 3. Periodic DOM Scraping Fallback
let lastPrice = null;
let lastUpdate = Date.now();
let unchangedCount = 0;
let isStale = false;

setInterval(() => {
  if (!isContextValid()) return;
  
  const wsIdleTime = Date.now() - lastWsMessageTime;
  if (wsIdleTime > 4000) {
    const scraped = scrapeCurrentPageDOM();
    if (scraped && scraped.price) {
      const now = Date.now();
      if (scraped.price === lastPrice) {
        unchangedCount++;
        if (unchangedCount >= 30 && !isStale) {
          isStale = true;
          console.warn('[Praescius DOM Fallback] DOM price feed is stale. No change in 30 seconds.');
          safeSendMessage({
            action: 'LOG_EVENT',
            message: `DOM price feed is stale for symbol ${scraped.symbol}. Price remained at ${scraped.price} for 30s.`,
            type: 'warning'
          });
        }
      } else {
        isStale = false;
        unchangedCount = 0;
        lastPrice = scraped.price;
        lastUpdate = now;
        
        console.log('[Praescius DOM Fallback] Scraped Price:', scraped.price, 'Symbol:', scraped.symbol, 'Confidence:', scraped.confidence);
        
        safeSendMessage({
          action: 'DOM_TICK',
          price: scraped.price,
          symbol: scraped.symbol || 'UNKNOWN',
          source: scraped.source,
          confidence: scraped.confidence,
          timestamp: now
        });
      }
    }
  }
}, 1000);

function scrapeCurrentPageDOM() {
  const url = window.location.href;
  const title = document.title;
  let price = null;
  let symbol = null;
  let source = 'dom_selector';
  let confidence = 0.8;

  // 1. Try page-specific selector scraping using selectors from background
  try {
    for (const selector of activeSelectors) {
      const el = document.querySelector(selector);
      if (el) {
        const text = el.textContent.replace(/,/g, '').trim();
        const val = parseFloat(text);
        if (!isNaN(val) && val > 0) {
          price = val;
          source = 'dom_selector';
          confidence = 0.8;
          break;
        }
      }
    }
  } catch (err) {
    // selector error
  }

  // 2. Generic Title Fallback parser (highly stable across front-end rendering shifts)
  if (!price || isNaN(price)) {
    try {
      const numMatches = title.match(/\b\d{1,6}(?:\.\d{1,6})?\b/g);
      if (numMatches) {
        for (const numStr of numMatches) {
          const val = parseFloat(numStr);
          if (!isNaN(val) && val > 0 && numStr.includes('.')) {
            price = val;
            source = 'dom_title';
            confidence = 0.5;
            break;
          }
        }
      }
    } catch (e) {
      // ignore
    }
  }

  // 3. Extract Symbol from Title or URL
  try {
    const symMatch = title.match(/[A-Z]{3,}\/?[A-Z]{3,}/);
    if (symMatch) {
      symbol = symMatch[0].replace('_', '/');
    } else {
      if (url.includes('btc') || title.toLowerCase().includes('btc')) symbol = 'BTC/USD';
      else if (url.includes('eth') || title.toLowerCase().includes('eth')) symbol = 'ETH/USD';
      else symbol = 'EUR/USD';
    }
  } catch (e) {
    symbol = 'EUR/USD';
  }

  if (price && !isNaN(price)) {
    return { price, symbol, source, confidence };
  }
  return null;
}

// 4. Sidebar UI Injection logic
let sidebarContainer = null;
let sidebarIframe = null;

function initSidebar(shouldOpen) {
  if (!isContextValid()) return;

  if (!sidebarContainer) {
    // Style block to layout container, sidebar and page shift transitions
    const style = document.createElement('style');
    style.id = 'praescius-sidebar-styles';
    style.textContent = `
      #praescius-sidebar-container {
        position: fixed !important;
        top: 0 !important;
        right: -380px !important;
        left: auto !important;
        width: 380px !important;
        height: 100vh !important;
        z-index: 2147483647 !important;
        box-shadow: -5px 0 25px rgba(0, 0, 0, 0.5) !important;
        border-left: 1px solid rgba(255, 255, 255, 0.1) !important;
        transition: right 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
        background: #0a0d14 !important;
        overflow: hidden !important;
        box-sizing: border-box !important;
        margin: 0 !important;
        padding: 0 !important;
        transform: none !important;
      }
      #praescius-sidebar-container.open {
        right: 0 !important;
        left: auto !important;
      }
      #praescius-sidebar-iframe {
        width: 100% !important;
        height: 100% !important;
        border: none !important;
        background: transparent !important;
      }
      html.praescius-sidebar-active {
        overflow-x: hidden !important;
        background-color: #0a0d14 !important;
      }
      body.praescius-sidebar-active {
        width: calc(100% - 380px) !important;
        transform: translate3d(0, 0, 0) !important;
      }
      body {
        transition: transform 0.3s cubic-bezier(0.4, 0, 0.2, 1), width 0.3s cubic-bezier(0.4, 0, 0.2, 1) !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);

    // Create the container element
    sidebarContainer = document.createElement('div');
    sidebarContainer.id = 'praescius-sidebar-container';

    // Create iframe to isolate the extension's UI
    sidebarIframe = document.createElement('iframe');
    sidebarIframe.id = 'praescius-sidebar-iframe';
    sidebarIframe.src = chrome.runtime.getURL('ui/popup.html');

    sidebarContainer.appendChild(sidebarIframe);
    document.documentElement.appendChild(sidebarContainer);
  }

  if (shouldOpen) {
    sidebarContainer.classList.add('open');
    document.documentElement.classList.add('praescius-sidebar-active');
    document.body?.classList.add('praescius-sidebar-active');
  } else {
    sidebarContainer.classList.remove('open');
    document.documentElement.classList.remove('praescius-sidebar-active');
    document.body?.classList.remove('praescius-sidebar-active');
  }
}

// 5. Restore sidebar state on page load
try {
  if (isContextValid()) {
    chrome.storage.local.get(['sidebarOpen'], (res) => {
      if (chrome.runtime.lastError || !res) return;
      if (res.sidebarOpen) {
        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', () => {
            initSidebar(true);
          });
        } else {
          initSidebar(true);
        }
      }
    });
  }
} catch (err) {
  // ignore
}
