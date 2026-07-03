/**
 * Bybit Provider Plugin (Scaffold).
 * Implements the standard Provider interface contracts.
 */

import BaseProvider from '../baseProvider.js';

export class BybitProvider extends BaseProvider {
  constructor() {
    super('bybit');
    this.currentSymbol = 'BTC/USDT';
  }

  matches(url, title) {
    if (!url) return false;
    const hostname = new URL(url).hostname.toLowerCase();
    const cleanTitle = String(title || '').toLowerCase();
    return hostname.includes('bybit.com') || cleanTitle.includes('bybit');
  }

  async discover() {
    console.log('[Bybit Provider] Running discovery scan...');
    return {
      chartEngine: 'Lightweight Charts Canvas',
      transport: 'WebSocket (V5 Private/Public)',
      dataSource: 'Bybit Live Stream',
      confidence: 1.0
    };
  }

  connect() {
    console.log('[Bybit Provider] Connecting V5 listeners...');
    return true;
  }

  async getCandles() {
    return [];
  }

  async getTicks() {
    return [];
  }

  getSymbol() {
    return this.currentSymbol;
  }

  disconnect() {
    console.log('[Bybit Provider] Disconnected.');
    return true;
  }

  parse(payload, direction) {
    return null;
  }
}

export default BybitProvider;
