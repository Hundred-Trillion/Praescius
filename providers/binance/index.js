/**
 * Binance Provider Plugin.
 * Implements the standard Provider interface contracts.
 */

import BaseProvider from '../baseProvider.js';

export class BinanceProvider extends BaseProvider {
  constructor() {
    super('binance');
    this.currentSymbol = 'BTC/USDT';
    this.selectors = ['.showPrice', '.price', 'div[class*="priceText"]'];
  }

  matches(url, title) {
    if (!url) return false;
    const hostname = new URL(url).hostname.toLowerCase();
    const cleanTitle = String(title || '').toLowerCase();
    return hostname.includes('binance.com') || cleanTitle.includes('binance');
  }

  async discover() {
    console.log('[Binance Provider] Running environment discovery...');
    return {
      chartEngine: 'WebGL Canvas (TradingView Lightweight Charts)',
      transport: 'WebSocket Secure',
      dataSource: 'Binance Live WebSocket Stream',
      confidence: 1.0
    };
  }

  connect() {
    console.log('[Binance Provider] Interceptor connected.');
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
    console.log('[Binance Provider] Interceptor disconnected.');
    return true;
  }

  parse(payload, direction) {
    if (!payload || typeof payload !== 'string') return null;

    try {
      const parsed = JSON.parse(payload);
      
      // Handle standard Binance Kline stream event
      if (parsed.e === 'kline' && parsed.k) {
        const k = parsed.k;
        const symbol = this.formatSymbol(parsed.s || k.s);
        this.currentSymbol = symbol;
        
        return {
          schema: 1,
          provider: 'binance',
          symbol,
          timestamp: Number(k.t), // Start time of candle
          open: Number(k.o),
          high: Number(k.h),
          low: Number(k.l),
          close: Number(k.c),
          price: Number(k.c), // Latest close/current price
          volume: Number(k.v),
          timeframe: String(k.i), // e.g. '1m'
          source: 'kline_stream'
        };
      }
      
      // Handle standard Binance mini-ticker stream event
      if (parsed.e === '24hrMiniTicker') {
        const symbol = this.formatSymbol(parsed.s);
        this.currentSymbol = symbol;
        return {
          schema: 1,
          provider: 'binance',
          symbol,
          timestamp: Number(parsed.E), // Event time
          open: Number(parsed.o),
          high: Number(parsed.h),
          low: Number(parsed.l),
          close: Number(parsed.c),
          price: Number(parsed.c),
          volume: Number(parsed.v),
          timeframe: 'tick',
          source: 'ticker_stream'
        };
      }
    } catch (e) {
      // ignore
    }

    return null;
  }

  formatSymbol(raw) {
    if (!raw) return 'BTC/USDT';
    let sym = raw.toUpperCase();
    
    // Add slash separator if matching standard base assets
    if (sym.endsWith('USDT')) {
      return `${sym.slice(0, -4)}/USDT`;
    }
    if (sym.endsWith('BTC') && sym !== 'BTC') {
      return `${sym.slice(0, -3)}/BTC`;
    }
    return sym;
  }
}

export default BinanceProvider;
