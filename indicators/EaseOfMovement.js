/**
 * Ease of Movement (EMV) plugin.
 * Relates price change to volume.
 * Returns: EMA-smoothed EMV.
 */

import BaseIndicator from './baseIndicator.js';

export class EaseOfMovement extends BaseIndicator {
  constructor() {
    super('EaseOfMovement');
  }

  calculate(candles, params = {}) {
    const period = params.period || 14;
    const result = new Array(candles.length).fill(null);
    const rawEmv = [0];

    for (let i = 1; i < candles.length; i++) {
      const c = candles[i], p = candles[i - 1];
      const midMove = ((c.high + c.low) / 2) - ((p.high + p.low) / 2);
      const boxRatio = c.volume > 0 ? (c.volume / 1e6) / (c.high - c.low) : 0;
      rawEmv.push(boxRatio !== 0 ? midMove / boxRatio : 0);
    }

    // SMA of raw EMV
    for (let i = period - 1; i < rawEmv.length; i++) {
      const slice = rawEmv.slice(i - period + 1, i + 1);
      result[i] = slice.reduce((a, b) => a + b, 0) / period;
    }

    return result;
  }
}

export default EaseOfMovement;
