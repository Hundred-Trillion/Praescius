/**
 * Deriv Provider Plugin (Scaffold).
 * Implements the standard Provider interface contracts.
 */

import BaseProvider from '../baseProvider.js';

export class DerivProvider extends BaseProvider {
  constructor() {
    super('deriv');
    this.currentSymbol = 'R_100';
    this.selectors = ['.cq-current-price', '.chart-container-current-price'];
  }

  matches(url, title) {
    if (!url) return false;
    const hostname = new URL(url).hostname.toLowerCase();
    const cleanTitle = String(title || '').toLowerCase();
    return hostname.includes('deriv.com') || 
           hostname.includes('deriv.app') || 
           cleanTitle.includes('deriv');
  }

  async discover() {
    console.log('[Deriv Provider] Running environment discovery...');
    return {
      chartEngine: 'SmartCharts Canvas',
      transport: 'WebSocket (Binary API)',
      dataSource: 'Deriv API Client',
      confidence: 1.0
    };
  }

  connect() {
    console.log('[Deriv Provider] Subscribing to tick/history streams...');
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
    console.log('[Deriv Provider] Disconnected.');
    return true;
  }

  parse(payload, direction) {
    if (direction !== 'incoming') return null;
    if (!payload || typeof payload !== 'string') return null;

    try {
      const parsed = JSON.parse(payload);
      
      // 1. Handle ohlc updates
      if (parsed.msg_type === 'ohlc' && parsed.ohlc) {
        const o = parsed.ohlc;
        const symbol = this.formatSymbol(o.symbol);
        this.currentSymbol = symbol;
        
        return {
          schema: 1,
          provider: 'deriv',
          symbol,
          timestamp: Number(o.epoch) * 1000,
          open: Number(o.open),
          high: Number(o.high),
          low: Number(o.low),
          close: Number(o.close),
          price: Number(o.close),
          volume: 0,
          timeframe: String(o.granularity ? (o.granularity / 60) + 'm' : '1m'),
          source: 'deriv_ohlc'
        };
      }
      
      // 2. Handle tick updates
      if (parsed.msg_type === 'tick' && parsed.tick) {
        const t = parsed.tick;
        const symbol = this.formatSymbol(t.symbol);
        this.currentSymbol = symbol;
        const price = Number(t.quote);
        
        return {
          schema: 1,
          provider: 'deriv',
          symbol,
          timestamp: Number(t.epoch) * 1000,
          open: price,
          high: price,
          low: price,
          close: price,
          price: price,
          volume: 0,
          timeframe: 'tick',
          source: 'deriv_tick'
        };
      }
    } catch (e) {
      // ignore
    }
    return null;
  }

  formatSymbol(raw) {
    if (!raw) return 'R_100';
    return String(raw).toUpperCase();
  }
}

export default DerivProvider;
