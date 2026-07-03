/**
 * OKX Provider Plugin (Scaffold).
 * Implements the standard Provider interface contracts.
 */

import BaseProvider from '../baseProvider.js';

export class OKXProvider extends BaseProvider {
  constructor() {
    super('okx');
    this.currentSymbol = 'BTC/USDT';
    this.selectors = ['[class*="index-price"]', '.price-text'];
  }

  matches(url, title) {
    if (!url) return false;
    const hostname = new URL(url).hostname.toLowerCase();
    const cleanTitle = String(title || '').toLowerCase();
    return hostname.includes('okx.com') || cleanTitle.includes('okx');
  }

  async discover() {
    console.log('[OKX Provider] Running environment discovery...');
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
    if (direction !== 'incoming') return null;
    if (!payload || typeof payload !== 'string') return null;

    try {
      const parsed = JSON.parse(payload);
      const arg = parsed.arg || {};
      const channel = arg.channel || '';
      
      // 1. Handle candle updates
      if (channel.startsWith('candle') && Array.isArray(parsed.data) && parsed.data.length > 0) {
        const k = parsed.data[0];
        if (Array.isArray(k) && k.length >= 6) {
          const symbol = this.formatSymbol(arg.instId);
          this.currentSymbol = symbol;
          const timeframe = channel.replace('candle', '');
          
          return {
            schema: 1,
            provider: 'okx',
            symbol,
            timestamp: Number(k[0]),
            open: Number(k[1]),
            high: Number(k[2]),
            low: Number(k[3]),
            close: Number(k[4]),
            price: Number(k[4]),
            volume: Number(k[5] || 0),
            timeframe,
            source: 'okx_candle'
          };
        }
      }
      
      // 2. Handle trade updates
      if (channel === 'trades' && Array.isArray(parsed.data) && parsed.data.length > 0) {
        const t = parsed.data[parsed.data.length - 1];
        const symbol = this.formatSymbol(arg.instId);
        this.currentSymbol = symbol;
        const price = Number(t.px);
        
        return {
          schema: 1,
          provider: 'okx',
          symbol,
          timestamp: Number(t.ts),
          open: price,
          high: price,
          low: price,
          close: price,
          price: price,
          volume: Number(t.sz || 0),
          timeframe: 'tick',
          source: 'okx_trade'
        };
      }
    } catch (e) {
      // ignore
    }
    return null;
  }

  formatSymbol(raw) {
    if (!raw) return 'BTC/USDT';
    return String(raw).toUpperCase().replace('-', '/');
  }
}

export default OKXProvider;
