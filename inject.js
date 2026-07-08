/**
 * Injection script (MAIN world context).
 * Overwrites global APIs and imports discovery modules using ES Dynamic Imports.
 */

(function() {
  const namespace = 'Praescius_Inject';

  // 1. Hook WebSocket APIs immediately
  const OriginalWebSocket = window.WebSocket;

  const HookedWebSocket = function HookedWebSocket(url, protocols) {
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

  HookedWebSocket.isHooked = true;
  HookedWebSocket.prototype = OriginalWebSocket.prototype;
  window.WebSocket = HookedWebSocket;

  // --- Inline Discovery Profiling Functions (Avoids CSP blocks from dynamic imports) ---

  function profileCanvas() {
    const report = {
      canvasCount: 0,
      webglCount: 0,
      webgl2Count: 0,
      isRenderEnginePresent: false
    };
    try {
      const canvases = Array.from(document.querySelectorAll('canvas'));
      report.canvasCount = canvases.length;
      canvases.forEach(canvas => {
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (gl) {
          report.webglCount++;
          report.isRenderEnginePresent = true;
        }
        const gl2 = canvas.getContext('webgl2');
        if (gl2) {
          report.webgl2Count++;
          report.isRenderEnginePresent = true;
        }
      });
    } catch (err) {
      report.error = err.message;
    }
    return report;
  }

  function profileWebsocket() {
    const report = {
      hasNativeWebSocket: typeof window.WebSocket !== 'undefined',
      hasSocketIO: typeof window.io !== 'undefined',
      isHookActive: false
    };
    try {
      if (window.WebSocket && (window.WebSocket.isHooked || String(window.WebSocket).includes('HookedWebSocket'))) {
        report.isHookActive = true;
      }
    } catch (err) {
      report.error = err.message;
    }
    return report;
  }

  function profilePixiJS() {
    const report = {
      isPixiPresent: false,
      version: null
    };
    try {
      if (window.PIXI) {
        report.isPixiPresent = true;
        report.version = window.PIXI.VERSION || 'Detected (Global)';
      } else if (window.__PIXI_SHARE_CONTEXT__) {
        report.isPixiPresent = true;
        report.version = 'Detected (Shared Context)';
      } else {
        const scripts = Array.from(document.querySelectorAll('script'))
          .map(s => s.src.toLowerCase())
          .filter(src => src);
        if (scripts.some(src => src.includes('pixi'))) {
          report.isPixiPresent = true;
          report.version = 'Detected (Script Tag)';
        }
      }
    } catch (err) {
      report.error = err.message;
    }
    return report;
  }

  async function profileStorage() {
    const report = {
      localStorageCount: 0,
      sessionStorageCount: 0,
      indexedDBNames: []
    };
    try {
      report.localStorageCount = Object.keys(localStorage).length;
      report.sessionStorageCount = Object.keys(sessionStorage).length;
      if (window.indexedDB && typeof window.indexedDB.databases === 'function') {
        const dbs = await window.indexedDB.databases();
        report.indexedDBNames = dbs.map(db => db.name);
      }
    } catch (err) {
      report.error = err.message;
    }
    return report;
  }

  function profileGlobals() {
    const report = {
      hasCocos: false,
      hasThreeJS: false,
      hasHighcharts: false,
      hasTradingView: false,
      pageTitle: '',
      hostname: ''
    };
    try {
      report.hasCocos = typeof window.cc !== 'undefined';
      report.hasThreeJS = typeof window.THREE !== 'undefined';
      report.hasHighcharts = typeof window.Highcharts !== 'undefined';
      report.hasTradingView = typeof window.TradingView !== 'undefined';
      report.pageTitle = document.title || '';
      report.hostname = window.location.hostname || '';
    } catch (err) {
      report.error = err.message;
    }
    return report;
  }

  async function runDiscovery() {
    const canvas = profileCanvas();
    const websocket = profileWebsocket();
    const pixi = profilePixiJS();
    const storage = await profileStorage();
    const globals = profileGlobals();

    const report = {
      chartEngine: 'Unknown',
      transport: 'Unknown',
      dataSource: 'Unknown',
      candlesFound: false,
      confidence: 0.1,
      details: {
        canvas,
        websocket,
        pixi,
        storage,
        globals
      }
    };

    const hostname = (globals && globals.hostname) ? globals.hostname.toLowerCase() : '';
    const isQuotex = hostname.includes('qxbroker') || hostname.includes('quotex');

    // 1. Chart engine selection
    if (isQuotex) {
      report.chartEngine = 'PixiJS';
    } else if (pixi.isPixiPresent) {
      report.chartEngine = 'PixiJS';
    } else if (globals.hasCocos) {
      report.chartEngine = 'Cocos2d';
    } else if (globals.hasThreeJS) {
      report.chartEngine = 'Three.js';
    } else if (globals.hasTradingView) {
      report.chartEngine = 'TradingView Chart';
    } else if (canvas.webglCount > 0 || canvas.webgl2Count > 0) {
      report.chartEngine = 'WebGL Render Canvas';
    } else if (canvas.canvasCount > 0) {
      report.chartEngine = 'HTML5 Canvas';
    }

    // 2. Transport selection
    if (isQuotex) {
      report.transport = 'Socket.IO';
    } else if (websocket.hasSocketIO) {
      report.transport = 'Socket.IO';
    } else if (websocket.hasNativeWebSocket) {
      report.transport = 'WebSocket (Native)';
    }

    report.dataSource = 'WebSocket Stream';

    // 3. Confidence score estimation
    let score = 0.2;
    if (isQuotex) {
      score += 0.3;
    }
    if (report.chartEngine === 'PixiJS') {
      score += 0.3;
    } else if (canvas.canvasCount > 0) {
      score += 0.1;
    }
    if (websocket.isHookActive) {
      score += 0.1;
    }

    // Boost to max confidence if on target broker, hooks are active, and chart engine is confirmed
    if (isQuotex && websocket.isHookActive && report.chartEngine !== 'Unknown') {
      score = 0.99;
    }

    report.confidence = Math.min(0.99, score);
    return report;
  }

  // 2. Perform Discovery directly
  async function performDiscovery() {
    try {
      const report = await runDiscovery();
      window.postMessage({
        type: 'DISCOVERY_REPORT',
        data: report
      }, '*');
    } catch (err) {
      console.warn(`[${namespace}] Discovery run failed:`, err);
    }
  }

  // --- Web3 Wallet Bridge Handler (MAIN context) ---
  window.addEventListener('message', async (event) => {
    const msg = event.data;
    if (!msg || typeof msg !== 'object') return;
    if (msg.source !== 'praescius-bridge') return;

    if (msg.type === 'CONNECT_WALLET') {
      if (typeof window.ethereum !== 'undefined') {
        try {
          const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' });
          window.postMessage({
            source: 'praescius-main-response',
            type: 'CONNECT_WALLET_RESPONSE',
            success: true,
            account: accounts[0]
          }, '*');
        } catch (err) {
          window.postMessage({
            source: 'praescius-main-response',
            type: 'CONNECT_WALLET_RESPONSE',
            success: false,
            error: err.message
          }, '*');
        }
      } else {
        window.postMessage({
          source: 'praescius-main-response',
          type: 'CONNECT_WALLET_RESPONSE',
          success: false,
          error: 'Web3 Wallet (e.g. MetaMask) not detected. Please install a Web3 wallet extension.'
        }, '*');
      }
    }

    if (msg.type === 'SIGN_WALLET') {
      if (typeof window.ethereum !== 'undefined') {
        try {
          const signature = await window.ethereum.request({
            method: 'personal_sign',
            params: [msg.hexMessage, msg.account]
          });
          window.postMessage({
            source: 'praescius-main-response',
            type: 'SIGN_WALLET_RESPONSE',
            success: true,
            signature: signature
          }, '*');
        } catch (err) {
          window.postMessage({
            source: 'praescius-main-response',
            type: 'SIGN_WALLET_RESPONSE',
            success: false,
            error: err.message
          }, '*');
        }
      } else {
        window.postMessage({
          source: 'praescius-main-response',
          type: 'SIGN_WALLET_RESPONSE',
          success: false,
          error: 'Web3 Wallet not detected.'
        }, '*');
      }
    }
  });

  // Start periodic discovery loops
  setTimeout(performDiscovery, 1000);
  setInterval(performDiscovery, 5000);
})();
