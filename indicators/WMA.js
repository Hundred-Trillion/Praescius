/**
 * Weighted Moving Average (WMA) plugin.
 * Linearly weights each data point, with the most recent receiving the highest weight.
 */

import BaseIndicator from './baseIndicator.js';

export class WMA extends BaseIndicator {
  constructor() {
    super('WMA');
  }

  calculate(candles, params = {}) {
    const period = params.period || 14;
    const prices = candles.map(c => c.close);
    const wma = new Array(prices.length).fill(null);
    const denom = (period * (period + 1)) / 2;

    for (let i = period - 1; i < prices.length; i++) {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += prices[i - j] * (period - j);
      }
      wma[i] = sum / denom;
    }

    return wma;
  }
}

export default WMA;
