/**
 * Pocket Option Provider Plugin (Scaffold).
 * Implements the standard Provider interface contracts.
 */

import BaseProvider from '../baseProvider.js';
import { normalizeSymbol } from '../../utils/helpers.js';

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
    if (!payload) return null;

    let messageBody = payload;

    // Handle binary frames (ArrayBuffer, Uint8Array)
    if (payload instanceof ArrayBuffer || ArrayBuffer.isView(payload)) {
      try {
        messageBody = new TextDecoder('utf-8').decode(payload);
      } catch (e) {
        return null;
      }
    }

    if (typeof messageBody !== 'string') return null;

    const prefixMatch = messageBody.match(/^([0-9]+)/);
    if (prefixMatch) {
      messageBody = messageBody.substring(prefixMatch[1].length);
    }

    if (!messageBody || messageBody === 'probe') return null;

    const extractJSON = (str) => {
      const firstBrace = str.indexOf('{');
      const firstBracket = str.indexOf('[');
      let start = -1;
      if (firstBrace !== -1 && firstBracket !== -1) {
        start = Math.min(firstBrace, firstBracket);
      } else {
        start = firstBrace !== -1 ? firstBrace : firstBracket;
      }
      if (start === -1) return null;
      
      let candidate = str.substring(start);
      while (candidate.length > 0) {
        try {
          const parsed = JSON.parse(candidate);
          return parsed;
        } catch (e) {
          candidate = candidate.slice(0, -1);
        }
      }
      return null;
    };

    try {
      let parsed = null;
      try {
        parsed = JSON.parse(messageBody);
      } catch (err) {
        parsed = extractJSON(messageBody);
      }

      if (!parsed) return null;

      // Handle raw positional array tuple directly (like [["EURUSD", 1.0845, 1719876540]])
      if (Array.isArray(parsed)) {
        let first = parsed;
        if (Array.isArray(parsed[0])) {
          first = parsed[0];
        }
        if (first.length >= 3 && typeof first[0] === 'string' && typeof first[1] === 'number' && typeof first[2] === 'number') {
          const rawSymbol = first[0];
          const symbol = this.formatSymbol(rawSymbol);
          this.currentSymbol = symbol;

          let timestamp = Date.now();
          let price = 0;

          if (first[1] > 100000000) {
            timestamp = first[1];
            price = first[2];
          } else if (first[2] > 100000000) {
            timestamp = first[2];
            price = first[1];
          } else {
            price = first[2];
            timestamp = first[1];
          }

          if (timestamp < 9999999999) {
            timestamp = timestamp * 1000;
          }
          timestamp = Number(timestamp);
          price = Number(price);

          return {
            schema: 1,
            provider: 'pocketoption',
            symbol,
            timestamp,
            open: price,
            high: price,
            low: price,
            close: price,
            price: price,
            volume: 0,
            timeframe: 'tick',
            source: 'po_binary_tuple'
          };
        }
      }
      
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
    return normalizeSymbol(raw || 'EUR/USD');
  }
}

export default PocketOptionProvider;
