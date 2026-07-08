/**
 * Klinger Oscillator plugin.
 * Measures money flow using volume and trend direction.
 * Returns: { ko, signal }
 */

import BaseIndicator from './baseIndicator.js';

export class KlingerOscillator extends BaseIndicator {
  constructor() {
    super('KlingerOscillator');
  }

  _ema(arr, period) {
    const k = 2 / (period + 1);
    const result = [arr[0]];
    for (let i = 1; i < arr.length; i++) {
      result.push(arr[i] * k + result[i - 1] * (1 - k));
    }
    return result;
  }

  calculate(candles, params = {}) {
    const fastPeriod = params.fastPeriod || 34;
    const slowPeriod = params.slowPeriod || 55;
    const signalPeriod = params.signalPeriod || 13;
    const result = new Array(candles.length).fill(null);

    const vf = [0];
    for (let i = 1; i < candles.length; i++) {
      const c = candles[i], p = candles[i - 1];
      const tp = c.high + c.low + c.close;
      const ptp = p.high + p.low + p.close;
      const trend = tp > ptp ? 1 : -1;
      vf.push(trend * (candles[i].volume || 0));
    }

    const fast = this._ema(vf, fastPeriod);
    const slow = this._ema(vf, slowPeriod);
    const ko = fast.map((f, i) => f - slow[i]);
    const signal = this._ema(ko, signalPeriod);

    const minIdx = slowPeriod + signalPeriod;
    for (let i = minIdx; i < candles.length; i++) {
      result[i] = { ko: ko[i], signal: signal[i] };
    }

    return result;
  }
}

export default KlingerOscillator;
