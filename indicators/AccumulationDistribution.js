/**
 * Accumulation/Distribution Line (ADL) plugin.
 * ADL = Previous ADL + Current Money Flow Volume
 * MFV = ((Close - Low) - (High - Close)) / (High - Low) * Volume
 */

import BaseIndicator from './baseIndicator.js';

export class AccumulationDistribution extends BaseIndicator {
  constructor() {
    super('AccumulationDistribution');
  }

  calculate(candles, params = {}) {
    const result = new Array(candles.length).fill(null);
    let adl = 0;

    for (let i = 0; i < candles.length; i++) {
      const c = candles[i];
      const range = c.high - c.low;
      const vol = c.volume || 0;
      const mfm = range === 0 ? 0 : ((c.close - c.low) - (c.high - c.close)) / range;
      adl += mfm * vol;
      result[i] = adl;
    }

    return result;
  }
}

export default AccumulationDistribution;
