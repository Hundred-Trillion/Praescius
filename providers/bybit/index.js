/**
 * Bybit Provider Plugin (Scaffold).
 * Implements the standard Provider interface contracts.
 */

import BaseProvider from '../baseProvider.js';

export class BybitProvider extends BaseProvider {
  constructor() {
    super('bybit');
    this.currentSymbol = 'BTC/USDT';
    this.selectors = ['[class*="price-value"]', '[class*="last-price"]'];
  }

  matches(url, title) {
    if (!url) return false;
    const hostname = new URL(url).hostname.toLowerCase();
    const cleanTitle = String(title || '').toLowerCase();
    return hostname.includes('bybit.com') || cleanTitle.includes('bybit');
  }


  parse(payload, direction) {
    if (direction !== 'incoming') return null;
    if (!payload || typeof payload !== 'string') return null;

    try {
      const parsed = JSON.parse(payload);
      const topic = parsed.topic || '';
      
      // 1. Handle kline updates
      if (topic.startsWith('kline.') && Array.isArray(parsed.data) && parsed.data.length > 0) {
        const k = parsed.data[0];
        const topicParts = topic.split('.');
        const rawSymbol = topicParts[topicParts.length - 1];
        const symbol = this.formatSymbol(rawSymbol);
        this.currentSymbol = symbol;
        let tfRaw = topicParts[1];
        let timeframe = tfRaw + 'm';
        if (tfRaw === '60') timeframe = '1h';
        if (tfRaw === 'D') timeframe = '1d';
        if (tfRaw === 'W') timeframe = '1w';
        if (tfRaw === 'M') timeframe = '1M';
        
        return {
          schema: 1,
          provider: 'bybit',
          symbol,
          timestamp: Number(k.start),
          open: Number(k.open),
          high: Number(k.high),
          low: Number(k.low),
          close: Number(k.close),
          price: Number(k.close),
          volume: Number(k.volume || 0),
          timeframe,
          source: 'bybit_kline'
        };
      }
      
      // 2. Handle trade updates
      if (topic.startsWith('publicTrade.') && Array.isArray(parsed.data) && parsed.data.length > 0) {
        const t = parsed.data[parsed.data.length - 1];
        const topicParts = topic.split('.');
        const rawSymbol = topicParts[topicParts.length - 1];
        const symbol = this.formatSymbol(rawSymbol);
        this.currentSymbol = symbol;
        const price = Number(t.p);
        
        return {
          schema: 1,
          provider: 'bybit',
          symbol,
          timestamp: Number(t.T),
          open: price,
          high: price,
          low: price,
          close: price,
          price: price,
          volume: Number(t.v || 0),
          timeframe: 'tick',
          source: 'bybit_trade'
        };
      }
    } catch (e) {
      // ignore
    }
    return null;
  }

  formatSymbol(raw) {
    if (!raw) return 'BTC/USDT';
    let clean = String(raw).toUpperCase();
    if (clean.endsWith('USDT')) {
      return `${clean.slice(0, -4)}/USDT`;
    }
    if (clean.endsWith('USD')) {
      return `${clean.slice(0, -3)}/USD`;
    }
    return clean;
  }
}

export default BybitProvider;
