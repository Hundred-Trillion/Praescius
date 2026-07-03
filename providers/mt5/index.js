/**
 * MetaTrader 5 Provider Plugin (Scaffold).
 * Implements the standard Provider interface contracts.
 */

import BaseProvider from '../baseProvider.js';

export class MT5Provider extends BaseProvider {
  constructor() {
    super('mt5');
    this.currentSymbol = 'EURUSD';
  }

  matches(url, title) {
    if (!url) return false;
    const hostname = new URL(url).hostname.toLowerCase();
    const cleanTitle = String(title || '').toLowerCase();
    return hostname.includes('metatrader5') || 
           hostname.includes('webterminal') || 
           cleanTitle.includes('metatrader 5') || 
           cleanTitle.includes('mt5');
  }

  async discover() {
    console.log('[MT5 Provider] Running discovery scan...');
    return {
      chartEngine: 'MetaQuotes HTML5 Canvas',
      transport: 'WebSocket (MT5 Web Gateway)',
      dataSource: 'MT5 Web Gateway Feed',
      confidence: 1.0
    };
  }

  connect() {
    console.log('[MT5 Provider] Intercepting MT5 WebSocket gateway...');
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
    console.log('[MT5 Provider] Disconnected.');
    return true;
  }

  parse(payload, direction) {
    return null;
  }
}

export default MT5Provider;
