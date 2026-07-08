/**
 * Anchored VWAP plugin.
 * Like VWAP but computed from a user-specified anchor index (params.anchorIndex, default 0).
 */

import BaseIndicator from './baseIndicator.js';

export class AnchoredVWAP extends BaseIndicator {
  constructor() {
    super('AnchoredVWAP');
  }

  calculate(candles, params = {}) {
    const anchor = params.anchorIndex || 0;
    const result = new Array(candles.length).fill(null);
    let cumTPV = 0;
    let cumVol = 0;

    for (let i = anchor; i < candles.length; i++) {
      const c = candles[i];
      const tp = (c.high + c.low + c.close) / 3;
      const vol = c.volume || 1;
      cumTPV += tp * vol;
      cumVol += vol;
      result[i] = cumVol > 0 ? cumTPV / cumVol : tp;
    }

    return result;
  }
}

export default AnchoredVWAP;
