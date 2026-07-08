/**
 * On Balance Volume (OBV) plugin.
 * Accumulates volume with sign based on price direction.
 */

import BaseIndicator from './baseIndicator.js';

export class OBV extends BaseIndicator {
  constructor() {
    super('OBV');
  }

  calculate(candles, params = {}) {
    const result = new Array(candles.length).fill(null);
    if (candles.length === 0) return result;
    let obv = 0;
    result[0] = 0;

    for (let i = 1; i < candles.length; i++) {
      const vol = candles[i].volume || 0;
      if (candles[i].close > candles[i - 1].close) obv += vol;
      else if (candles[i].close < candles[i - 1].close) obv -= vol;
      result[i] = obv;
    }

    return result;
  }
}

export default OBV;
