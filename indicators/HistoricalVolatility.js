/**
 * Historical Volatility (HV) plugin.
 * Annualised standard deviation of log returns.
 */

import BaseIndicator from './baseIndicator.js';

export class HistoricalVolatility extends BaseIndicator {
  constructor() {
    super('HistoricalVolatility');
  }

  calculate(candles, params = {}) {
    const period = params.period || 21;
    const annFactor = params.annFactor || 252;
    const result = new Array(candles.length).fill(null);
    const prices = candles.map(c => c.close);

    const logRet = [0];
    for (let i = 1; i < prices.length; i++) {
      logRet.push(prices[i - 1] > 0 ? Math.log(prices[i] / prices[i - 1]) : 0);
    }

    for (let i = period; i < prices.length; i++) {
      const slice = logRet.slice(i - period + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const variance = slice.reduce((s, v) => s + (v - mean) ** 2, 0) / (period - 1);
      result[i] = Math.sqrt(variance * annFactor) * 100;
    }

    return result;
  }
}

export default HistoricalVolatility;
