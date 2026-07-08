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
    
    // Use SMA for the first period to prevent signal drift (important for MACD)
    let sum = 0;
    for (let i = 0; i < Math.min(period, prices.length); i++) {
      sum += prices[i];
    }
    let prevEma = sum / Math.min(period, prices.length);
    
    for (let i = 0; i < period - 1; i++) {
      ema.push(null);
    }
    ema.push(prevEma);

    for (let i = period; i < prices.length; i++) {
      const curEma = prices[i] * k + prevEma * (1 - k);
      ema.push(curEma);
      prevEma = curEma;
    }

    return ema;
  }
}

export default EMA;
