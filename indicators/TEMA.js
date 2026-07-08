/**
 * Triple Exponential Moving Average (TEMA) plugin.
 * TEMA = 3 * EMA1 - 3 * EMA2 + EMA3
 * Reduces lag significantly vs standard EMA.
 */

import BaseIndicator from './baseIndicator.js';

export class TEMA extends BaseIndicator {
  constructor() {
    super('TEMA');
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
    const ema2Clean = ema2.map((v, i) => v !== null ? v : ema1Clean[i]);
    const ema3 = this._ema(ema2Clean, period);

    const tema = prices.map((_, i) => {
      if (ema1[i] === null || ema2[i] === null || ema3[i] === null) return null;
      return 3 * ema1[i] - 3 * ema2[i] + ema3[i];
    });

    return tema;
  }
}

export default TEMA;
