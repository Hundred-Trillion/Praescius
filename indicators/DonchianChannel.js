/**
 * Donchian Channel plugin.
 * Upper = highest high over period, Lower = lowest low over period.
 * Returns: { upper, lower, mid } per candle.
 */

import BaseIndicator from './baseIndicator.js';

export class DonchianChannel extends BaseIndicator {
  constructor() {
    super('DonchianChannel');
  }

  calculate(candles, params = {}) {
    const period = params.period || 20;
    const result = new Array(candles.length).fill(null);

    for (let i = period - 1; i < candles.length; i++) {
      const slice = candles.slice(i - period + 1, i + 1);
      const upper = Math.max(...slice.map(c => c.high));
      const lower = Math.min(...slice.map(c => c.low));
      result[i] = { upper, lower, mid: (upper + lower) / 2 };
    }

    return result;
  }
}

export default DonchianChannel;
