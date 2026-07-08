/**
 * Volume Weighted Moving Average (VWMA) plugin.
 * Each price is weighted by its volume over the period.
 */

import BaseIndicator from './baseIndicator.js';

export class VWMA extends BaseIndicator {
  constructor() {
    super('VWMA');
  }

  calculate(candles, params = {}) {
    const period = params.period || 20;
    const vwma = new Array(candles.length).fill(null);

    for (let i = period - 1; i < candles.length; i++) {
      let sumPV = 0;
      let sumV = 0;
      for (let j = 0; j < period; j++) {
        const c = candles[i - j];
        const vol = c.volume || 1;
        sumPV += c.close * vol;
        sumV += vol;
      }
      vwma[i] = sumV > 0 ? sumPV / sumV : candles[i].close;
    }

    return vwma;
  }
}

export default VWMA;
