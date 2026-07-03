/**
 * Content Script (ISOLATED world context).
 * Bridges data channels and passes extension IDs to page contexts.
 */

// 1. Inject the extension asset path into the main page context
try {
  const seedScript = document.createElement('script');
  seedScript.textContent = `window.__AETHERIS_EXTENSION_URL__ = "${chrome.runtime.getURL('')}";`;
  (document.head || document.documentElement).appendChild(seedScript);
  seedScript.remove();
} catch (err) {
  console.error('[Aetheris_Content] Failed to seed extension URL:', err);
}

// 2. Listen to postMessage frames and relay to service worker
let lastWsMessageTime = Date.now();
let lastDomPrice = null;
let activeSelectors = [];

// Request provider selectors on startup
chrome.runtime.sendMessage({
  action: 'GET_PROVIDER_SELECTORS',
  url: window.location.href
}, (response) => {
  if (response && response.success && Array.isArray(response.selectors)) {
    activeSelectors = response.selectors;
    console.log('[Aetheris Content] Loaded dynamic selectors from background:', activeSelectors);
  }
});

window.addEventListener('message', (event) => {
  if (event.source !== window) return;

  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;

  // Handle WebSocket raw frames
  if (msg.type === 'WS_FRAME') {
    lastWsMessageTime = Date.now();
    chrome.runtime.sendMessage({
      action: 'WS_FRAME',
      direction: msg.direction,
      payload: msg.payload,
      url: msg.url,
      timestamp: Date.now()
    }, () => {
      if (chrome.runtime.lastError) {
        // ignore
      }
    });
  }

  // Handle Discovery aggregations
  if (msg.type === 'DISCOVERY_REPORT') {
    chrome.runtime.sendMessage({
      action: 'DISCOVERY_REPORT',
      data: msg.data
    }, () => {
      if (chrome.runtime.lastError) {
        // ignore
      }
    });
  }
});

// 3. Periodic DOM Scraping Fallback
let lastPrice = null;
let lastUpdate = Date.now();
let unchangedCount = 0;
let isStale = false;

setInterval(() => {
  const wsIdleTime = Date.now() - lastWsMessageTime;
  
  if (wsIdleTime > 4000) {
    const scraped = scrapeCurrentPageDOM();
    if (scraped && scraped.price) {
      const now = Date.now();
      if (scraped.price === lastPrice) {
        unchangedCount++;
        if (unchangedCount >= 30 && !isStale) {
          isStale = true;
          console.warn('[Aetheris DOM Fallback] DOM price feed is stale. No change in 30 seconds.');
          chrome.runtime.sendMessage({
            action: 'LOG_EVENT',
            message: `DOM price feed is stale for symbol ${scraped.symbol}. Price remained at ${scraped.price} for 30s.`,
            type: 'warning'
          }, () => { if (chrome.runtime.lastError) {} });
        }
      } else {
        isStale = false;
        unchangedCount = 0;
        lastPrice = scraped.price;
        lastUpdate = now;
        
        console.log('[Aetheris DOM Fallback] Scraped Price:', scraped.price, 'Symbol:', scraped.symbol, 'Confidence:', scraped.confidence);
        
        chrome.runtime.sendMessage({
          action: 'DOM_TICK',
          price: scraped.price,
          symbol: scraped.symbol || 'UNKNOWN',
          source: scraped.source,
          confidence: scraped.confidence,
          timestamp: now
        }, () => {
          if (chrome.runtime.lastError) {
            // ignore
          }
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
      symbol = symMatch[0].replace('/', '/');
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
