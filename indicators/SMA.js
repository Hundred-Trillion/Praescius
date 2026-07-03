/**
 * Simple Moving Average (SMA) plugin.
 */

import BaseIndicator from './baseIndicator.js';

export class SMA extends BaseIndicator {
  constructor() {
    super('SMA');
  }

  calculate(candles, params = {}) {
    const period = params.period || 14;
    const prices = candles.map(c => c.close);
    const sma = [];

    for (let i = 0; i < prices.length; i++) {
      if (i < period - 1) {
        sma.push(null);
        continue;
      }
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += prices[i - j];
      }
      sma.push(sum / period);
    }
    return sma;
  }
}

export default SMA;
