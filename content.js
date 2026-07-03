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
window.addEventListener('message', (event) => {
  if (event.source !== window) return;

  const msg = event.data;
  if (!msg || typeof msg !== 'object') return;

  // Handle WebSocket raw frames
  if (msg.type === 'WS_FRAME') {
    chrome.runtime.sendMessage({
      action: 'WS_FRAME',
      direction: msg.direction,
      payload: msg.payload,
      url: msg.url,
      timestamp: Date.now()
    }, () => {
      // Catch empty listeners errors silently
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
