/**
 * Bollinger Bands plugin.
 * Returns: { upper, middle, lower, bandwidth, percentB } per candle.
 */

import BaseIndicator from './baseIndicator.js';

export class BollingerBands extends BaseIndicator {
  constructor() {
    super('BollingerBands');
  }

  calculate(candles, params = {}) {
    const period = params.period || 20;
    const stdDevMult = params.stdDevMult || 2;
    const result = new Array(candles.length).fill(null);
    const prices = candles.map(c => c.close);

    for (let i = period - 1; i < prices.length; i++) {
      const slice = prices.slice(i - period + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
      const stdDev = Math.sqrt(variance);
      const upper = mean + stdDevMult * stdDev;
      const lower = mean - stdDevMult * stdDev;
      const bandwidth = (upper - lower) / mean * 100;
      const percentB = (upper - lower) !== 0 ? (prices[i] - lower) / (upper - lower) * 100 : 50;
      result[i] = { upper, middle: mean, lower, bandwidth, percentB };
    }

    return result;
  }
}

export default BollingerBands;
