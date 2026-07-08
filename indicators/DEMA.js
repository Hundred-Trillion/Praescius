/**
 * Double Exponential Moving Average (DEMA) plugin.
 * DEMA = 2 * EMA1 - EMA(EMA1)
 * Reduces lag vs standard EMA by using double smoothing.
 */

import BaseIndicator from './baseIndicator.js';

export class DEMA extends BaseIndicator {
  constructor() {
    super('DEMA');
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
    const period = params.period || 14;
    const prices = candles.map(c => c.close);

    const ema1 = this._ema(prices, period);
    const ema1Clean = ema1.map((v, i) => v !== null ? v : prices[i]);
    const ema2 = this._ema(ema1Clean, period);

    const dema = prices.map((_, i) => {
      if (ema1[i] === null || ema2[i] === null) return null;
      return 2 * ema1[i] - ema2[i];
    });

    return dema;
  }
}

export default DEMA;
