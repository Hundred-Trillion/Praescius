/**
 * Rate of Change (ROC) plugin.
 * ROC = ((Close - Close[n]) / Close[n]) * 100
 */

import BaseIndicator from './baseIndicator.js';

export class ROC extends BaseIndicator {
  constructor() {
    super('ROC');
  }

  calculate(candles, params = {}) {
    const period = params.period || 12;
    const prices = candles.map(c => c.close);
    const roc = new Array(prices.length).fill(null);

    for (let i = period; i < prices.length; i++) {
      const prev = prices[i - period];
      roc[i] = prev !== 0 ? ((prices[i] - prev) / prev) * 100 : 0;
    }

    return roc;
  }
}

export default ROC;
