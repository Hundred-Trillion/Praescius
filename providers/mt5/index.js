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
    console.log('[MT5 Provider] Running environment discovery...');
    return {
      chartEngine: 'MetaQuotes HTML5 Canvas',
      transport: 'WebSocket (MT5 Web Gateway)',
      dataSource: 'MT5 Web Gateway Feed',
      confidence: 1.0
    };
  }

  connect() {
    console.log('[MT5 Provider] Monitoring MT5 WebSocket gateway...');
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
    if (direction !== 'incoming') return null;
    if (!payload || typeof payload !== 'string') return null;

    try {
      const parsed = JSON.parse(payload);
      
      // 1. Handle tick updates
      if ((parsed.action === 'tick' || parsed.action === 'quote') && parsed.symbol) {
        const symbol = this.formatSymbol(parsed.symbol);
        this.currentSymbol = symbol;
        const price = Number(parsed.bid || parsed.ask || parsed.price || parsed.close);
        if (isNaN(price)) return null;

        return {
          schema: 1,
          provider: 'mt5',
          symbol,
          timestamp: Number(parsed.time || Date.now()),
          open: price,
          high: price,
          low: price,
          close: price,
          price: price,
          volume: Number(parsed.volume || 0),
          timeframe: 'tick',
          source: 'mt5_tick'
        };
      }

      // 2. Handle history updates
      if ((parsed.action === 'history' || parsed.action === 'candles') && parsed.symbol && Array.isArray(parsed.bars)) {
        if (parsed.bars.length > 0) {
          const symbol = this.formatSymbol(parsed.symbol);
          this.currentSymbol = symbol;
          const bar = parsed.bars[parsed.bars.length - 1];
          
          return {
            schema: 1,
            provider: 'mt5',
            symbol,
            timestamp: Number(bar.time || Date.now()),
            open: Number(bar.open),
            high: Number(bar.high),
            low: Number(bar.low),
            close: Number(bar.close),
            price: Number(bar.close),
            volume: Number(bar.volume || 0),
            timeframe: String(parsed.timeframe || '1m'),
            source: 'mt5_history'
          };
        }
      }
    } catch (e) {
      // ignore
    }
    return null;
  }

  formatSymbol(raw) {
    if (!raw) return 'EURUSD';
    let clean = String(raw).toUpperCase();
    if (clean.length === 6 && !clean.includes('/')) {
      return `${clean.substring(0, 3)}/${clean.substring(3, 6)}`;
    }
    return clean;
  }
}

export default MT5Provider;
