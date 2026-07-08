/**
 * Fibonacci Retracement/Extension plugin.
 * Computes standard fib levels from a swing high/low range.
 * Returns a single object on the last candle with all levels.
 */

import BaseIndicator from './baseIndicator.js';

export class Fibonacci extends BaseIndicator {
  constructor() {
    super('Fibonacci');
  }

  calculate(candles, params = {}) {
    const result = new Array(candles.length).fill(null);
    const lookback = params.lookback || candles.length;
    const slice = candles.slice(-lookback);

    const swingHigh = Math.max(...slice.map(c => c.high));
    const swingLow = Math.min(...slice.map(c => c.low));
    const range = swingHigh - swingLow;

    const retraceLevels = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
    const extLevels = [1.272, 1.414, 1.618, 2.0, 2.618];

    const retracements = {};
    for (const r of retraceLevels) {
      retracements[`${(r * 100).toFixed(1)}%`] = swingHigh - range * r;
    }

    const extensions = {};
    for (const e of extLevels) {
      extensions[`${(e * 100).toFixed(1)}%`] = swingLow + range * e;
    }

    result[candles.length - 1] = {
      swingHigh, swingLow, range, retracements, extensions
    };

    return result;
  }
}

export default Fibonacci;
