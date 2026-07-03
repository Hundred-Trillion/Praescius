/**
 * Dummy Provider Plugin.
 * Implements the standard Provider interface contracts.
 */

import BaseProvider from '../../providers/baseProvider.js';

export class DummyProvider extends BaseProvider {
  constructor() {
    super('dummy');
    this.currentSymbol = 'DUMMY';
  }

  matches(url, title) {
    if (!url) return false;
    return url.includes('dummy-exchange.com') || title.toLowerCase().includes('dummy exchange');
  }

  parse(payload, direction) {
    try {
      const data = JSON.parse(payload);
      return {
        schema: 1,
        provider: 'dummy',
        symbol: data.symbol || this.currentSymbol,
        timestamp: Date.now(),
        open: Number(data.price),
        high: Number(data.price),
        low: Number(data.price),
        close: Number(data.price),
        price: Number(data.price),
        volume: Number(data.volume || 0),
        timeframe: 'tick',
        source: 'ws',
        confidence: 1.0
      };
    } catch (e) {
      return null;
    }
  }
}

export default DummyProvider;
