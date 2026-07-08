/**
 * Quotex Provider Plugin.
 * Implements the standard Provider interface contracts.
 */

import BaseProvider from '../baseProvider.js';
import { normalizeSymbol, extractJSON } from '../../utils/helpers.js';

export class QuotexProvider extends BaseProvider {
  constructor() {
    super('quotex');
    this.currentSymbol = 'BTC/USD';
    this.selectors = ['.chart-legend__price', '.value__price', '.current-price'];
  }

  matches(url, title) {
    if (!url) return false;
    const hostname = new URL(url).hostname.toLowerCase();
    const cleanTitle = String(title || '').toLowerCase();
    return hostname.includes('qxbroker') || 
           hostname.includes('quotex') || 
           cleanTitle.includes('quotex');
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
    
    // Clean Socket.IO headers
    const prefixMatch = messageBody.match(/^([0-9]+)/);
    if (prefixMatch) {
      messageBody = messageBody.substring(prefixMatch[1].length);
    }

    if (!messageBody || messageBody === 'probe') return null;

    if (!messageBody || messageBody === 'probe') return null;

    try {
      let parsed = null;
      try {
        parsed = JSON.parse(messageBody);
      } catch (err) {
        parsed = extractJSON(messageBody);
      }

      if (!parsed) return this.fallbackRegex(messageBody);

      // Handle raw positional array tuple directly (like [["ATOUSD_otc",1783090072.115,1.5095,0]])
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
            provider: 'quotex',
            symbol,
            timestamp,
            open: price,
            high: price,
            low: price,
            close: price,
            price: price,
            volume: 0,
            timeframe: 'tick',
            source: 'quotex_binary_tuple'
          };
        }
      }

      // Handle standard Socket.IO event array [eventName, eventData]
      if (Array.isArray(parsed) && parsed.length >= 2) {
        const [eventName, eventData] = parsed;
        return this.parseEventPayload(eventName, eventData);
      }
      
      // Handle direct JSON object
      if (typeof parsed === 'object' && parsed !== null) {
        return this.parseDirectPayload(parsed, 'direct');
      }
    } catch (e) {
      return this.fallbackRegex(messageBody);
    }

    return null;
  }

  parseEventPayload(eventName, eventData) {
    const name = String(eventName).toLowerCase();
    if (
      name.includes('candle') ||
      name.includes('tick') ||
      name.includes('chart') ||
      name.includes('quote') ||
      name.includes('price') ||
      name.includes('history')
    ) {
      return this.parseDirectPayload(eventData, name);
    }
    return null;
  }

  parseDirectPayload(data, context) {
    if (!data) return null;

    // Handle array wraps
    if (Array.isArray(data)) {
      if (data.length > 0) {
        return this.parseDirectPayload(data[data.length - 1], `${context}_array`);
      }
      return null;
    }

    // Check symbol identification
    const symbolField = data.symbol || data.active || data.asset || data.pair || data.activeId || data.symbolId;
    if (!symbolField && !('open' in data && 'close' in data)) {
      return null;
    }

    const symbol = this.formatSymbol(String(symbolField || 'BTC/USD'));
    this.currentSymbol = symbol;

    // Timestamp normalization
    let rawTime = data.time || data.timestamp || data.ts || Date.now();
    if (typeof rawTime === 'number' && rawTime < 9999999999) {
      rawTime = rawTime * 1000;
    }
    const timestamp = Number(rawTime);

    // Extract OHLC metrics
    let open, high, low, close, price;
    const volume = data.volume || data.vol || 0;

    if ('open' in data && 'close' in data) {
      open = Number(data.open);
      close = Number(data.close);
      high = 'high' in data ? Number(data.high) : Math.max(open, close);
      low = 'low' in data ? Number(data.low) : Math.min(open, close);
      price = close;
    } else if ('price' in data || 'rate' in data || 'last' in data) {
      price = Number(data.price || data.rate || data.last);
      open = price;
      high = price;
      low = price;
      close = price;
      price = price;
    } else {
      return null;
    }

    let timeframe = '1m';
    if (data.timeframe || data.tf || data.period) {
      timeframe = String(data.timeframe || data.tf || data.period);
    } else if (context.includes('tick')) {
      timeframe = 'tick';
    }

    if (isNaN(open) || isNaN(close) || isNaN(high) || isNaN(low) || isNaN(price)) {
      return null;
    }

    return {
      schema: 1,
      provider: 'quotex',
      symbol,
      timestamp,
      open,
      high,
      low,
      close,
      price,
      volume,
      timeframe,
      source: context
    };
  }

  formatSymbol(raw) {
    if (!raw) return 'BTC/USD';
    let sym = String(raw).toUpperCase().trim();
    if (sym === '1') return 'BTC/USD';
    return normalizeSymbol(raw);
  }

  fallbackRegex(message) {
    try {
      const priceMatch = message.match(/"price"\s*:\s*([0-9.]+)/i);
      const closeMatch = message.match(/"close"\s*:\s*([0-9.]+)/i);
      
      if (priceMatch || closeMatch) {
        const price = Number((priceMatch || closeMatch)[1]);
        this.currentSymbol = 'BTC/USD';
        return {
          schema: 1,
          provider: 'quotex',
          symbol: 'BTC/USD',
          timestamp: Date.now(),
          open: price,
          high: price,
          low: price,
          close: price,
          price: price,
          volume: 0,
          timeframe: 'tick',
          source: 'regex_fallback'
        };
      }
    } catch (e) {
      // ignore
    }
    return null;
  }
}

export default QuotexProvider;
