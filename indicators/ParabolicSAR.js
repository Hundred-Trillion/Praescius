/**
 * Parabolic SAR plugin.
 * Returns SAR value per candle. Direction: 1=long, -1=short.
 * Returns: { sar, direction } per candle.
 */

import BaseIndicator from './baseIndicator.js';

export class ParabolicSAR extends BaseIndicator {
  constructor() {
    super('ParabolicSAR');
  }

  calculate(candles, params = {}) {
    const startAF = params.startAF || 0.02;
    const stepAF = params.stepAF || 0.02;
    const maxAF = params.maxAF || 0.2;
    const result = new Array(candles.length).fill(null);
    if (candles.length < 2) return result;

    let direction = 1; // 1 = up, -1 = down
    let af = startAF;
    let ep = candles[0].high; // extreme point
    let sar = candles[0].low;

    for (let i = 1; i < candles.length; i++) {
      const c = candles[i];
      const prev = candles[i - 1];
      let newSAR = sar + af * (ep - sar);

      if (direction === 1) {
        newSAR = Math.min(newSAR, prev.low, i > 1 ? candles[i - 2].low : prev.low);
        if (c.low < newSAR) {
          direction = -1;
          newSAR = ep;
          ep = c.low;
          af = startAF;
        } else {
          if (c.high > ep) { ep = c.high; af = Math.min(af + stepAF, maxAF); }
        }
      } else {
        newSAR = Math.max(newSAR, prev.high, i > 1 ? candles[i - 2].high : prev.high);
        if (c.high > newSAR) {
          direction = 1;
          newSAR = ep;
          ep = c.high;
          af = startAF;
        } else {
          if (c.low < ep) { ep = c.low; af = Math.min(af + stepAF, maxAF); }
        }
      }

      sar = newSAR;
      result[i] = { sar, direction };
    }

    return result;
  }
}

export default ParabolicSAR;
