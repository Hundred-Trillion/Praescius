/**
 * Hull Moving Average (HMA) plugin.
 * HMA = WMA(2 * WMA(n/2) - WMA(n), sqrt(n))
 * Significantly reduces lag compared to EMA/WMA.
 */

import BaseIndicator from './baseIndicator.js';

export class HMA extends BaseIndicator {
  constructor() {
    super('HMA');
  }

  _wma(prices, period) {
    const result = new Array(prices.length).fill(null);
    const denom = (period * (period + 1)) / 2;
    for (let i = period - 1; i < prices.length; i++) {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += prices[i - j] * (period - j);
      }
      result[i] = sum / denom;
    }
    return result;
  }

  calculate(candles, params = {}) {
    const period = params.period || 14;
    const prices = candles.map(c => c.close);
    const halfPeriod = Math.floor(period / 2);
    const sqrtPeriod = Math.round(Math.sqrt(period));

    const wmaFull = this._wma(prices, period);
    const wmaHalf = this._wma(prices, halfPeriod);

    // Build intermediate series: 2 * WMA(n/2) - WMA(n)
    const diff = prices.map((_, i) => {
      if (wmaFull[i] === null || wmaHalf[i] === null) return null;
      return 2 * wmaHalf[i] - wmaFull[i];
    });

    // Fill nulls with nearest available value for WMA pass
    const diffPrices = diff.map((v, i) => v !== null ? v : (prices[i] || 0));
    const hma = this._wma(diffPrices, sqrtPeriod);

    // Nullify immature values
    for (let i = 0; i < period + sqrtPeriod - 2; i++) {
      if (i < hma.length) hma[i] = null;
    }

    return hma;
  }
}

export default HMA;
