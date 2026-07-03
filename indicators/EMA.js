/**
 * Exponential Moving Average (EMA) plugin.
 */

import BaseIndicator from './baseIndicator.js';

export class EMA extends BaseIndicator {
  constructor() {
    super('EMA');
  }

  calculate(candles, params = {}) {
    const period = params.period || 14;
    const prices = candles.map(c => c.close);
    const ema = [];

    if (prices.length === 0) return ema;

    const k = 2 / (period + 1);
    let prevEma = prices[0];
    ema.push(prevEma);

    for (let i = 1; i < prices.length; i++) {
      const curEma = prices[i] * k + prevEma * (1 - k);
      ema.push(curEma);
      prevEma = curEma;
    }

    // Set immature periods to null
    for (let i = 0; i < Math.min(period - 1, prices.length); i++) {
      ema[i] = null;
    }

    return ema;
  }
}

export default EMA;
