/**
 * Pocket Option Provider Plugin (Scaffold).
 * Implements the standard Provider interface contracts.
 */

import BaseProvider from '../baseProvider.js';

export class PocketOptionProvider extends BaseProvider {
  constructor() {
    super('pocketoption');
    this.currentSymbol = 'EUR/USD';
    this.selectors = ['.price-value', 'div[class*="current-price"]'];
  }

  matches(url, title) {
    if (!url) return false;
    const hostname = new URL(url).hostname.toLowerCase();
    const cleanTitle = String(title || '').toLowerCase();
    return hostname.includes('pocketoption') || 
           hostname.includes('po.trade') || 
           cleanTitle.includes('pocket option');
  }

  async discover() {
    console.log('[PocketOption Provider] Running environment discovery...');
    return {
      chartEngine: 'WebGL Engine (Lightweight)',
      transport: 'WebSocket (Binary Frames)',
      dataSource: 'PO Streaming Feed',
      confidence: 1.0
    };
  }

  connect() {
    console.log('[PocketOption Provider] Hooking WebSocket connection...');
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
    console.log('[PocketOption Provider] Disconnected.');
    return true;
  }

  parse(payload, direction) {
    if (direction !== 'incoming') return null;
    if (!payload || typeof payload !== 'string') return null;

    let messageBody = payload;
    const prefixMatch = payload.match(/^([0-9]+)/);
    if (prefixMatch) {
      messageBody = payload.substring(prefixMatch[1].length);
    }

    if (!messageBody || messageBody === 'probe') return null;

    try {
      const parsed = JSON.parse(messageBody);
      
      if (Array.isArray(parsed) && parsed.length >= 2) {
        const [eventName, eventData] = parsed;
        if (eventName === 'quotes' && eventData) {
          const symbol = this.formatSymbol(eventData.asset || eventData.symbol || 'EUR/USD');
          this.currentSymbol = symbol;
          const price = Number(eventData.price || eventData.close || eventData.rate);
          if (isNaN(price)) return null;

          return {
            schema: 1,
            provider: 'pocketoption',
            symbol,
            timestamp: Number(eventData.time || Date.now()),
            open: price,
            high: price,
            low: price,
            close: price,
            price: price,
            volume: 0,
            timeframe: 'tick',
            source: 'po_quotes'
          };
        }
      }
    } catch (e) {
      // ignore
    }
    return null;
  }

  formatSymbol(raw) {
    if (!raw) return 'EUR/USD';
    let clean = String(raw).toUpperCase();
    if (clean.length === 6) {
      return `${clean.substring(0, 3)}/${clean.substring(3, 6)}`;
    }
    return clean;
  }
}

export default PocketOptionProvider;
