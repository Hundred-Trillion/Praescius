/**
 * Kaufman Adaptive Moving Average (KAMA) plugin.
 * Adapts smoothing based on market noise/efficiency ratio.
 * Faster in trending markets, slower in ranging markets.
 */

import BaseIndicator from './baseIndicator.js';

export class KAMA extends BaseIndicator {
  constructor() {
    super('KAMA');
  }

  calculate(candles, params = {}) {
    const period = params.period || 10;
    const fastPeriod = params.fastPeriod || 2;
    const slowPeriod = params.slowPeriod || 30;
    const prices = candles.map(c => c.close);
    const kama = new Array(prices.length).fill(null);

    if (prices.length <= period) return kama;

    const fastSC = 2 / (fastPeriod + 1);
    const slowSC = 2 / (slowPeriod + 1);

    kama[period - 1] = prices[period - 1];

    for (let i = period; i < prices.length; i++) {
      const direction = Math.abs(prices[i] - prices[i - period]);
      let volatility = 0;
      for (let j = 1; j <= period; j++) {
        volatility += Math.abs(prices[i - j + 1] - prices[i - j]);
      }

      const er = volatility !== 0 ? direction / volatility : 0;
      const sc = Math.pow(er * (fastSC - slowSC) + slowSC, 2);
      const prevKama = kama[i - 1] !== null ? kama[i - 1] : prices[i - 1];
      kama[i] = prevKama + sc * (prices[i] - prevKama);
    }

    return kama;
  }
}

export default KAMA;
