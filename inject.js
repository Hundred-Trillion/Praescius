/**
 * Injection script (MAIN world context).
 * Overwrites global APIs and imports discovery modules using ES Dynamic Imports.
 */

(function() {
  const namespace = 'QXObserver_Inject';

  // 1. Hook WebSocket APIs immediately
  const OriginalWebSocket = window.WebSocket;

  const HookedWebSocket = function(url, protocols) {
    const ws = protocols ? new OriginalWebSocket(url, protocols) : new OriginalWebSocket(url);

    const originalSend = ws.send;
    ws.send = function(data) {
      try {
        let payload = data;
        if (payload instanceof Blob) {
          payload.text().then(text => {
            window.postMessage({
              type: 'WS_FRAME',
              direction: 'outgoing',
              payload: text,
              url: url
            }, '*');
          }).catch(() => {});
        } else {
          if (payload instanceof ArrayBuffer || ArrayBuffer.isView(payload)) {
            try {
              payload = new TextDecoder('utf-8').decode(payload);
            } catch (e) {}
          }
          window.postMessage({
            type: 'WS_FRAME',
            direction: 'outgoing',
            payload: payload,
            url: url
          }, '*');
        }
      } catch (err) {}
      return originalSend.apply(this, arguments);
    };

    ws.addEventListener('message', (event) => {
      try {
        let payload = event.data;
        if (payload instanceof Blob) {
          payload.text().then(text => {
            window.postMessage({
              type: 'WS_FRAME',
              direction: 'incoming',
              payload: text,
              url: url
            }, '*');
          }).catch(() => {});
        } else {
          if (payload instanceof ArrayBuffer || ArrayBuffer.isView(payload)) {
            try {
              payload = new TextDecoder('utf-8').decode(payload);
            } catch (e) {}
          }
          window.postMessage({
            type: 'WS_FRAME',
            direction: 'incoming',
            payload: payload,
            url: url
          }, '*');
        }
      } catch (err) {}
    });

    return ws;
  };

  HookedWebSocket.prototype = OriginalWebSocket.prototype;
  window.WebSocket = HookedWebSocket;

  // 2. Perform Dynamic Imports for Discovery once the extension URL is seeded
  async function performDiscovery() {
    try {
      const extUrl = window.__AETHERIS_EXTENSION_URL__;
      if (!extUrl) {
        // Retry in 500ms if content script hasn't seeded yet
        setTimeout(performDiscovery, 500);
        return;
      }

      const discoveryModulePath = `${extUrl}discovery/discovery.js`;
      const { runDiscovery } = await import(discoveryModulePath);
      
      const report = await runDiscovery();
      
      window.postMessage({
        type: 'DISCOVERY_REPORT',
        data: report
      }, '*');

    } catch (err) {
      console.warn(`[${namespace}] Discovery import/run failed:`, err);
    }
  }

  // Start periodic discovery loops
  setTimeout(performDiscovery, 1000);
  setInterval(performDiscovery, 5000);
})();
