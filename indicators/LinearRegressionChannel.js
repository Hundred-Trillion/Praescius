/**
 * Linear Regression Channel plugin.
 * Uses OLS regression to compute mid-line, upper and lower channel bands.
 * Returns: { mid, upper, lower, slope, intercept } per candle.
 */

import BaseIndicator from './baseIndicator.js';

export class LinearRegressionChannel extends BaseIndicator {
  constructor() {
    super('LinearRegressionChannel');
  }

  calculate(candles, params = {}) {
    const period = params.period || 20;
    const deviations = params.deviations || 2;
    const result = new Array(candles.length).fill(null);
    const prices = candles.map(c => c.close);

    for (let i = period - 1; i < prices.length; i++) {
      const slice = prices.slice(i - period + 1, i + 1);
      const n = slice.length;
      const sumX = (n * (n - 1)) / 2;
      const sumX2 = ((n - 1) * n * (2 * n - 1)) / 6;
      const sumY = slice.reduce((a, b) => a + b, 0);
      const sumXY = slice.reduce((s, y, x) => s + x * y, 0);

      const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
      const intercept = (sumY - slope * sumX) / n;
      const mid = intercept + slope * (n - 1);

      const stdDev = Math.sqrt(slice.reduce((s, y, x) => {
        const pred = intercept + slope * x;
        return s + (y - pred) ** 2;
      }, 0) / n);

      result[i] = {
        mid,
        upper: mid + deviations * stdDev,
        lower: mid - deviations * stdDev,
        slope,
        intercept
      };
    }

    return result;
  }
}

export default LinearRegressionChannel;
