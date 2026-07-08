/**
 * Money Flow Index (MFI) plugin.
 * Volume-weighted RSI using typical price.
 * Overbought > 80, Oversold < 20.
 */

import BaseIndicator from './baseIndicator.js';

export class MFI extends BaseIndicator {
  constructor() {
    super('MFI');
  }

  calculate(candles, params = {}) {
    const period = params.period || 14;
    const result = new Array(candles.length).fill(null);

    const tp = candles.map(c => (c.high + c.low + c.close) / 3);
    const mf = candles.map((c, i) => tp[i] * (c.volume || 1));

    for (let i = period; i < candles.length; i++) {
      let posFlow = 0, negFlow = 0;
      for (let j = i - period + 1; j <= i; j++) {
        if (tp[j] > tp[j - 1]) posFlow += mf[j];
        else negFlow += mf[j];
      }
      const mfr = negFlow === 0 ? 100 : posFlow / negFlow;
      result[i] = 100 - (100 / (1 + mfr));
    }

    return result;
  }
}

export default MFI;
