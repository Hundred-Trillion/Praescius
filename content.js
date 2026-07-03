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
setInterval(() => {
  const wsIdleTime = Date.now() - lastWsMessageTime;
  
  // If no WS frames received in the last 4 seconds, activate DOM fallback
  if (wsIdleTime > 4000) {
    const scraped = scrapeCurrentPageDOM();
    if (scraped && scraped.price && scraped.price !== lastDomPrice) {
      lastDomPrice = scraped.price;
      
      console.log('[Aetheris DOM Fallback] Scraped Price:', scraped.price, 'Symbol:', scraped.symbol);
      
      chrome.runtime.sendMessage({
        action: 'DOM_TICK',
        price: scraped.price,
        symbol: scraped.symbol || 'UNKNOWN',
        timestamp: Date.now()
      }, () => {
        if (chrome.runtime.lastError) {
          // ignore
        }
      });
    }
  }
}, 1000);

function scrapeCurrentPageDOM() {
  const url = window.location.href;
  const title = document.title;
  let price = null;
  let symbol = null;

  // 1. Try page-specific selector scraping
  try {
    if (url.includes('tradingview.com')) {
      const el = document.querySelector('.chart-markup-table div.price, span[class*="last-value-"], div[class*="selected-value-"]');
      if (el) price = parseFloat(el.textContent.replace(/,/g, ''));
    } else if (url.includes('qxbroker') || url.includes('quotex')) {
      const el = document.querySelector('.chart-legend__price, .value__price, .current-price');
      if (el) price = parseFloat(el.textContent.replace(/,/g, ''));
    } else if (url.includes('binance.com')) {
      const el = document.querySelector('.showPrice, .price, div[class*="priceText"]');
      if (el) price = parseFloat(el.textContent.replace(/,/g, ''));
    } else if (url.includes('deriv.com') || url.includes('deriv.app')) {
      const el = document.querySelector('.cq-current-price, .chart-container-current-price');
      if (el) price = parseFloat(el.textContent.replace(/,/g, ''));
    } else if (url.includes('pocketoption') || url.includes('po.trade')) {
      const el = document.querySelector('.price-value, div[class*="current-price"]');
      if (el) price = parseFloat(el.textContent.replace(/,/g, ''));
    } else if (url.includes('bybit.com')) {
      const el = document.querySelector('[class*="price-value"], [class*="last-price"]');
      if (el) price = parseFloat(el.textContent.replace(/,/g, ''));
    } else if (url.includes('okx.com')) {
      const el = document.querySelector('[class*="index-price"], .price-text');
      if (el) price = parseFloat(el.textContent.replace(/,/g, ''));
    } else if (url.includes('metatrader') || title.toLowerCase().includes('mt5')) {
      const el = document.querySelector('[class*="bid-price"], [class*="ask-price"], .price-text');
      if (el) price = parseFloat(el.textContent.replace(/,/g, ''));
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
    return { price, symbol };
  }
  return null;
}
