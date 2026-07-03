/**
 * Relative Strength Index (RSI) plugin.
 */

import BaseIndicator from './baseIndicator.js';

export class RSI extends BaseIndicator {
  constructor() {
    super('RSI');
  }

  calculate(candles, params = {}) {
    const period = params.period || 14;
    const prices = candles.map(c => c.close);
    const rsi = new Array(prices.length).fill(null);

    if (prices.length <= period) return rsi;

    let avgGain = 0;
    let avgLoss = 0;

    for (let i = 1; i <= period; i++) {
      const change = prices[i] - prices[i - 1];
      if (change > 0) {
        avgGain += change;
      } else {
        avgLoss += Math.abs(change);
      }
    }

    avgGain /= period;
    avgLoss /= period;

    let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));

    for (let i = period + 1; i < prices.length; i++) {
      const change = prices[i] - prices[i - 1];
      let gain = 0;
      let loss = 0;
      if (change > 0) {
        gain = change;
      } else {
        loss = Math.abs(change);
      }

      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;

      rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      rsi[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));
    }

    return rsi;
  }
}

export default RSI;
