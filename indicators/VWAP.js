/**
 * Volume Weighted Average Price (VWAP) plugin.
 */

import BaseIndicator from './baseIndicator.js';

export class VWAP extends BaseIndicator {
  constructor() {
    super('VWAP');
  }

  calculate(candles, params = {}) {
    const vwap = [];
    let cumulativeTPV = 0;
    let cumulativeVol = 0;

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const tp = (c.high + c.low + c.close) / 3;
      const vol = c.volume || 1; // Fallback to 1 if volume is zero/missing

      cumulativeTPV += tp * vol;
      cumulativeVol += vol;

      vwap.push(cumulativeTPV / cumulativeVol);
    }

    return vwap;
  }
}

export default VWAP;
