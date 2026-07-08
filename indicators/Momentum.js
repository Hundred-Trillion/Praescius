/**
 * Momentum (MOM) plugin.
 * MOM = Close - Close[n]
 */

import BaseIndicator from './baseIndicator.js';

export class Momentum extends BaseIndicator {
  constructor() {
    super('Momentum');
  }

  calculate(candles, params = {}) {
    const period = params.period || 10;
    const prices = candles.map(c => c.close);
    const mom = new Array(prices.length).fill(null);

    for (let i = period; i < prices.length; i++) {
      mom[i] = prices[i] - prices[i - period];
    }

    return mom;
  }
}

export default Momentum;
