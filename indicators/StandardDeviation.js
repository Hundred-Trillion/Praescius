/**
 * Standard Deviation plugin.
 * Rolling population standard deviation of close prices.
 */

import BaseIndicator from './baseIndicator.js';

export class StandardDeviation extends BaseIndicator {
  constructor() {
    super('StandardDeviation');
  }

  calculate(candles, params = {}) {
    const period = params.period || 20;
    const result = new Array(candles.length).fill(null);
    const prices = candles.map(c => c.close);

    for (let i = period - 1; i < prices.length; i++) {
      const slice = prices.slice(i - period + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period;
      result[i] = Math.sqrt(variance);
    }

    return result;
  }
}

export default StandardDeviation;
