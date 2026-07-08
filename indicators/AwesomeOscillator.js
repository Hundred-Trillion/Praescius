/**
 * Awesome Oscillator (AO) plugin.
 * AO = SMA(Midpoints, 5) - SMA(Midpoints, 34)
 */

import BaseIndicator from './baseIndicator.js';

export class AwesomeOscillator extends BaseIndicator {
  constructor() {
    super('AwesomeOscillator');
  }

  _sma(arr, period, start) {
    if (start < period - 1) return null;
    let sum = 0;
    for (let i = start - period + 1; i <= start; i++) sum += arr[i];
    return sum / period;
  }

  calculate(candles, params = {}) {
    const fastPeriod = params.fastPeriod || 5;
    const slowPeriod = params.slowPeriod || 34;
    const result = new Array(candles.length).fill(null);
    const midpoints = candles.map(c => (c.high + c.low) / 2);

    for (let i = slowPeriod - 1; i < candles.length; i++) {
      const fast = this._sma(midpoints, fastPeriod, i);
      const slow = this._sma(midpoints, slowPeriod, i);
      if (fast !== null && slow !== null) result[i] = fast - slow;
    }

    return result;
  }
}

export default AwesomeOscillator;
