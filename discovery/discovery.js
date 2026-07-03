/**
 * Discovery aggregator.
 * Combines modular scanning components.
 */

import { profileCanvas } from './canvas.js';
import { profileWebsocket } from './websocket.js';
import { profilePixiJS } from './pixijs.js';
import { profileStorage } from './storage.js';
import { profileGlobals } from './globals.js';

/**
 * Runs a comprehensive audit of the page environment.
 * @returns {Promise<object>} Compiled discovery report
 */
export async function runDiscovery() {
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

  // 1. Chart engine selection
  if (pixi.isPixiPresent) {
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
  if (websocket.hasSocketIO) {
    report.transport = 'Socket.IO';
  } else if (websocket.hasNativeWebSocket) {
    report.transport = 'WebSocket (Native)';
  }

  report.dataSource = 'WebSocket Stream';

  // 3. Confidence score estimation
  let score = 0.2;
  const hostname = (globals && globals.hostname) ? globals.hostname.toLowerCase() : '';
  
  if (hostname && (hostname.includes('qxbroker') || hostname.includes('quotex'))) {
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

  report.confidence = Math.min(0.99, score);

  return report;
}
