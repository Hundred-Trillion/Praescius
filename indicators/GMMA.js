/**
 * Guppy Multiple Moving Average (GMMA) plugin.
 * Returns two groups of EMAs: short-term (traders) and long-term (investors).
 * Returns: { short: { ema3, ema5, ema8, ema10, ema12, ema15 }, long: { ema30, ema35, ema40, ema45, ema50, ema60 } }
 */

import BaseIndicator from './baseIndicator.js';

export class GMMA extends BaseIndicator {
  constructor() {
    super('GMMA');
  }

  _ema(prices, period) {
    const k = 2 / (period + 1);
    const result = new Array(prices.length).fill(null);
    let prev = prices[0];
    result[0] = prev;
    for (let i = 1; i < prices.length; i++) {
      prev = prices[i] * k + prev * (1 - k);
      result[i] = prev;
    }
    for (let i = 0; i < Math.min(period - 1, prices.length); i++) {
      result[i] = null;
    }
    return result;
  }

  calculate(candles, params = {}) {
    const prices = candles.map(c => c.close);
    const shortPeriods = [3, 5, 8, 10, 12, 15];
    const longPeriods = [30, 35, 40, 45, 50, 60];

    const build = (periods) => {
      const group = {};
      for (const p of periods) {
        group[`ema${p}`] = this._ema(prices, p);
      }
      return group;
    };

    // Return an array of per-candle objects for compatibility
    return candles.map((_, i) => ({
      short: Object.fromEntries(shortPeriods.map(p => [`ema${p}`, this._ema(prices, p)[i]])),
      long: Object.fromEntries(longPeriods.map(p => [`ema${p}`, this._ema(prices, p)[i]]))
    }));
  }
}

export default GMMA;
