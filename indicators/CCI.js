/**
 * Commodity Channel Index (CCI) plugin.
 * CCI = (Typical Price - SMA(TP, period)) / (0.015 * Mean Deviation)
 */

import BaseIndicator from './baseIndicator.js';

export class CCI extends BaseIndicator {
  constructor() {
    super('CCI');
  }

  calculate(candles, params = {}) {
    const period = params.period || 20;
    const cci = new Array(candles.length).fill(null);

    const tp = candles.map(c => (c.high + c.low + c.close) / 3);

    for (let i = period - 1; i < tp.length; i++) {
      const slice = tp.slice(i - period + 1, i + 1);
      const mean = slice.reduce((a, b) => a + b, 0) / period;
      const meanDev = slice.reduce((sum, v) => sum + Math.abs(v - mean), 0) / period;
      cci[i] = meanDev === 0 ? 0 : (tp[i] - mean) / (0.015 * meanDev);
    }

    return cci;
  }
}

export default CCI;
