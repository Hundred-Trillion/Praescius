/**
 * Average True Range (ATR) plugin.
 */

import BaseIndicator from './baseIndicator.js';

export class ATR extends BaseIndicator {
  constructor() {
    super('ATR');
  }

  calculate(candles, params = {}) {
    const period = params.period || 14;
    const atr = new Array(candles.length).fill(null);
    if (candles.length <= period) return atr;

    // 1. Calculate True Ranges
    const tr = [candles[0].high - candles[0].low];
    for (let i = 1; i < candles.length; i++) {
      const c = candles[i];
      const prevC = candles[i - 1];
      const h_l = c.high - c.low;
      const h_pc = Math.abs(c.high - prevC.close);
      const l_pc = Math.abs(c.low - prevC.close);
      tr.push(Math.max(h_l, h_pc, l_pc));
    }

    // 2. Initial ATR (SMA of TR for first period)
    let sum = 0;
    for (let i = 0; i < period; i++) {
      sum += tr[i];
    }
    let currentAtr = sum / period;
    atr[period - 1] = currentAtr;

    // 3. Wilder's Smoothing
    for (let i = period; i < candles.length; i++) {
      currentAtr = (currentAtr * (period - 1) + tr[i]) / period;
      atr[i] = currentAtr;
    }

    return atr;
  }
}

export default ATR;
