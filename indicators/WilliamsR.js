/**
 * Williams %R plugin.
 * %R = (Highest High - Close) / (Highest High - Lowest Low) * -100
 * Oscillates between -100 and 0. Overbought above -20, oversold below -80.
 */

import BaseIndicator from './baseIndicator.js';

export class WilliamsR extends BaseIndicator {
  constructor() {
    super('WilliamsR');
  }

  calculate(candles, params = {}) {
    const period = params.period || 14;
    const result = new Array(candles.length).fill(null);

    for (let i = period - 1; i < candles.length; i++) {
      const slice = candles.slice(i - period + 1, i + 1);
      const highestHigh = Math.max(...slice.map(c => c.high));
      const lowestLow = Math.min(...slice.map(c => c.low));
      const range = highestHigh - lowestLow;
      result[i] = range === 0 ? 0 : ((highestHigh - candles[i].close) / range) * -100;
    }

    return result;
  }
}

export default WilliamsR;
