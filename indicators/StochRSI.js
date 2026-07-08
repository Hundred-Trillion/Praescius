/**
 * Stochastic RSI plugin.
 * StochRSI = (RSI - min(RSI,period)) / (max(RSI,period) - min(RSI,period))
 * Returns: { k, d } per candle.
 */

import BaseIndicator from './baseIndicator.js';
import RSI from './RSI.js';

export class StochRSI extends BaseIndicator {
  constructor() {
    super('StochRSI');
    this.rsiCalc = new RSI();
  }

  calculate(candles, params = {}) {
    const rsiPeriod = params.rsiPeriod || 14;
    const stochPeriod = params.stochPeriod || 14;
    const kSmooth = params.kSmooth || 3;
    const dSmooth = params.dSmooth || 3;

    const rsiValues = this.rsiCalc.calculate(candles, { period: rsiPeriod });
    const result = new Array(candles.length).fill(null);

    // Compute raw StochRSI K line
    const rawK = new Array(candles.length).fill(null);
    for (let i = stochPeriod - 1; i < rsiValues.length; i++) {
      const slice = rsiValues.slice(i - stochPeriod + 1, i + 1).filter(v => v !== null);
      if (slice.length < stochPeriod) continue;
      const minRSI = Math.min(...slice);
      const maxRSI = Math.max(...slice);
      rawK[i] = maxRSI === minRSI ? 0 : (rsiValues[i] - minRSI) / (maxRSI - minRSI) * 100;
    }

    // Smooth K with SMA
    const smoothK = new Array(candles.length).fill(null);
    for (let i = kSmooth - 1; i < rawK.length; i++) {
      const slice = rawK.slice(i - kSmooth + 1, i + 1).filter(v => v !== null);
      if (slice.length === kSmooth) smoothK[i] = slice.reduce((a, b) => a + b, 0) / kSmooth;
    }

    // Compute D as SMA of K
    for (let i = dSmooth - 1; i < smoothK.length; i++) {
      const slice = smoothK.slice(i - dSmooth + 1, i + 1).filter(v => v !== null);
      if (slice.length === dSmooth) {
        result[i] = { k: smoothK[i], d: slice.reduce((a, b) => a + b, 0) / dSmooth };
      }
    }

    return result;
  }
}

export default StochRSI;
