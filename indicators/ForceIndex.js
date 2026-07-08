/**
 * Force Index (FI) plugin.
 * FI = (Close - PrevClose) * Volume
 * Returns EMA-smoothed force index.
 */

import BaseIndicator from './baseIndicator.js';

export class ForceIndex extends BaseIndicator {
  constructor() {
    super('ForceIndex');
  }

  calculate(candles, params = {}) {
    const period = params.period || 13;
    const result = new Array(candles.length).fill(null);
    const k = 2 / (period + 1);
    let ema = null;

    for (let i = 1; i < candles.length; i++) {
      const raw = (candles[i].close - candles[i - 1].close) * (candles[i].volume || 0);
      ema = ema === null ? raw : raw * k + ema * (1 - k);
      if (i >= period) result[i] = ema;
    }

    return result;
  }
}

export default ForceIndex;
