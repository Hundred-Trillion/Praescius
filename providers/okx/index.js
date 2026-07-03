/**
 * OKX Provider Plugin (Scaffold).
 * Implements the standard Provider interface contracts.
 */

import BaseProvider from '../baseProvider.js';

export class OKXProvider extends BaseProvider {
  constructor() {
    super('okx');
    this.currentSymbol = 'BTC/USDT';
  }

  matches(url, title) {
    if (!url) return false;
    const hostname = new URL(url).hostname.toLowerCase();
    const cleanTitle = String(title || '').toLowerCase();
    return hostname.includes('okx.com') || cleanTitle.includes('okx');
  }

  async discover() {
    console.log('[OKX Provider] Running discovery scan...');
    return {
      chartEngine: 'OKX Chart Engine',
      transport: 'WebSocket (V5 Public)',
      dataSource: 'OKX WebSocket Stream',
      confidence: 1.0
    };
  }

  connect() {
    console.log('[OKX Provider] Connecting V5 public listeners...');
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
    console.log('[OKX Provider] Disconnected.');
    return true;
  }

  parse(payload, direction) {
    return null;
  }
}

export default OKXProvider;
