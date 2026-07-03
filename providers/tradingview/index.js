/**
 * TradingView Provider Plugin (Scaffold).
 * Implements the standard Provider interface contracts.
 */

import BaseProvider from '../baseProvider.js';

export class TradingViewProvider extends BaseProvider {
  constructor() {
    super('tradingview');
    this.currentSymbol = 'BTC/USD';
    this.selectors = ['.chart-markup-table div.price', 'span[class*="last-value-"]', 'div[class*="selected-value-"]'];
  }

  matches(url, title) {
    if (!url) return false;
    const hostname = new URL(url).hostname.toLowerCase();
    const cleanTitle = String(title || '').toLowerCase();
    return hostname.includes('tradingview.com') || cleanTitle.includes('tradingview');
  }

  async discover() {
    console.log('[TradingView Provider] Running environment discovery...');
    return {
      chartEngine: 'TradingView Canvas Chart Engine',
      transport: 'WebSocket (Pro Chart Protocol)',
      dataSource: 'TradingView WebSocket API',
      confidence: 1.0
    };
  }

  connect() {
    console.log('[TradingView Provider] Hooking chart sockets...');
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
    console.log('[TradingView Provider] Disconnected.');
    return true;
  }

  parse(payload, direction) {
    if (direction !== 'incoming') return null;
    if (!payload || typeof payload !== 'string') return null;

    try {
      if (payload.includes('~m~')) {
        const parts = payload.split(/~m~\d+~m~/);
        for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed) continue;
          
          try {
            const parsed = JSON.parse(trimmed);
            
            // 1. Handle quote updates (qsd)
            if (parsed.m === 'qsd' && Array.isArray(parsed.p) && parsed.p.length >= 2) {
              const quoteData = parsed.p[1];
              if (quoteData && quoteData.v) {
                const symbol = this.formatSymbol(quoteData.n || parsed.p[0]);
                this.currentSymbol = symbol;
                const price = Number(quoteData.v.lp || quoteData.v.ask || quoteData.v.bid);
                if (isNaN(price)) continue;
                
                return {
                  schema: 1,
                  provider: 'tradingview',
                  symbol,
                  timestamp: Date.now(),
                  open: price,
                  high: price,
                  low: price,
                  close: price,
                  price: price,
                  volume: Number(quoteData.v.volume || 0),
                  timeframe: 'tick',
                  source: 'tv_qsd'
                };
              }
            }

            // 2. Handle timescale (candle) updates
            if (parsed.m === 'timescale_update' && Array.isArray(parsed.p) && parsed.p.length >= 2) {
              const series = parsed.p[1];
              if (series && series.s) {
                for (const chartId in series.s) {
                  const node = series.s[chartId];
                  if (node && Array.isArray(node.v)) {
                    const candleArray = node.v[node.v.length - 1];
                    if (Array.isArray(candleArray) && candleArray.length >= 6) {
                      const [idx, o, h, l, c, v] = candleArray;
                      const symbol = this.currentSymbol;
                      return {
                        schema: 1,
                        provider: 'tradingview',
                        symbol,
                        timestamp: Date.now(),
                        open: Number(o),
                        high: Number(h),
                        low: Number(l),
                        close: Number(c),
                        price: Number(c),
                        volume: Number(v || 0),
                        timeframe: '1m',
                        source: 'tv_timescale'
                      };
                    }
                  }
                }
              }
            }
          } catch (e) {
            // ignore inner parse errors
          }
        }
      }
    } catch (err) {
      // ignore outer error
    }
    return null;
  }

  formatSymbol(raw) {
    if (!raw) return 'BTC/USD';
    let clean = String(raw).toUpperCase();
    if (clean.includes(':')) {
      clean = clean.split(':')[1];
    }
    if (clean.endsWith('USDT')) {
      return `${clean.slice(0, -4)}/USDT`;
    }
    if (clean.endsWith('USD')) {
      return `${clean.slice(0, -3)}/USD`;
    }
    return clean;
  }
}

export default TradingViewProvider;
