/**
 * Ultimate Oscillator (UO) plugin.
 * Combines short, medium, and long period buying pressure ratios.
 * UO = 100 * ((4*BP7 + 2*BP14 + BP28) / (4*TR7 + 2*TR14 + TR28))
 */

import BaseIndicator from './baseIndicator.js';

export class UltimateOscillator extends BaseIndicator {
  constructor() {
    super('UltimateOscillator');
  }

  _sum(arr, end, period) {
    let s = 0;
    for (let i = end - period + 1; i <= end; i++) s += arr[i];
    return s;
  }

  calculate(candles, params = {}) {
    const p1 = params.period1 || 7;
    const p2 = params.period2 || 14;
    const p3 = params.period3 || 28;
    const longest = Math.max(p1, p2, p3);
    const result = new Array(candles.length).fill(null);

    const bp = [0];  // buying pressure
    const tr = [candles[0].high - candles[0].low]; // true range

    for (let i = 1; i < candles.length; i++) {
      const c = candles[i];
      const prevClose = candles[i - 1].close;
      bp.push(c.close - Math.min(c.low, prevClose));
      const highLow = c.high - c.low;
      const highPC = Math.abs(c.high - prevClose);
      const lowPC = Math.abs(c.low - prevClose);
      tr.push(Math.max(highLow, highPC, lowPC));
    }

    for (let i = longest - 1; i < candles.length; i++) {
      const bp1 = this._sum(bp, i, p1), tr1 = this._sum(tr, i, p1);
      const bp2 = this._sum(bp, i, p2), tr2 = this._sum(tr, i, p2);
      const bp3 = this._sum(bp, i, p3), tr3 = this._sum(tr, i, p3);
      const num = (4 * (tr1 > 0 ? bp1 / tr1 : 0)) + (2 * (tr2 > 0 ? bp2 / tr2 : 0)) + (tr3 > 0 ? bp3 / tr3 : 0);
      result[i] = 100 * num / 7;
    }

    return result;
  }
}

export default UltimateOscillator;
