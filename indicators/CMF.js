/**
 * Chaikin Money Flow (CMF) plugin.
 * CMF = Sum(MFV, period) / Sum(Volume, period)
 * MFV = ((Close - Low) - (High - Close)) / (High - Low) * Volume
 */

import BaseIndicator from './baseIndicator.js';

export class CMF extends BaseIndicator {
  constructor() {
    super('CMF');
  }

  calculate(candles, params = {}) {
    const period = params.period || 20;
    const result = new Array(candles.length).fill(null);

    const mfv = candles.map(c => {
      const range = c.high - c.low;
      const vol = c.volume || 0;
      if (range === 0) return 0;
      return ((c.close - c.low) - (c.high - c.close)) / range * vol;
    });

    for (let i = period - 1; i < candles.length; i++) {
      let sumMFV = 0, sumVol = 0;
      for (let j = i - period + 1; j <= i; j++) {
        sumMFV += mfv[j];
        sumVol += (candles[j].volume || 0);
      }
      result[i] = sumVol > 0 ? sumMFV / sumVol : 0;
    }

    return result;
  }
}

export default CMF;
