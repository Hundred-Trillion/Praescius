/**
 * SuperTrend plugin.
 * SuperTrend uses ATR-based bands to determine trend direction.
 * Returns: { supertrend, direction } per candle. direction: 1=bullish, -1=bearish.
 */

import BaseIndicator from './baseIndicator.js';
import ATR from './ATR.js';

export class SuperTrend extends BaseIndicator {
  constructor() {
    super('SuperTrend');
    this.atrCalc = new ATR();
  }

  calculate(candles, params = {}) {
    const period = params.period || 10;
    const multiplier = params.multiplier || 3;
    const result = new Array(candles.length).fill(null);
    const atrValues = this.atrCalc.calculate(candles, { period });

    let direction = 1;
    let prevST = null;
    let prevUpperBand = null;
    let prevLowerBand = null;

    for (let i = period; i < candles.length; i++) {
      const c = candles[i];
      const atr = atrValues[i];
      if (atr === null) continue;

      const hl2 = (c.high + c.low) / 2;
      let upperBand = hl2 + multiplier * atr;
      let lowerBand = hl2 - multiplier * atr;

      if (prevUpperBand !== null && upperBand > prevUpperBand && candles[i - 1].close < prevUpperBand) upperBand = prevUpperBand;
      if (prevLowerBand !== null && lowerBand < prevLowerBand && candles[i - 1].close > prevLowerBand) lowerBand = prevLowerBand;

      if (prevST !== null) {
        if (prevST === prevUpperBand && c.close <= upperBand) direction = -1;
        else if (prevST === prevUpperBand && c.close > upperBand) direction = 1;
        else if (prevST === prevLowerBand && c.close >= lowerBand) direction = 1;
        else if (prevST === prevLowerBand && c.close < lowerBand) direction = -1;
      }

      const st = direction === 1 ? lowerBand : upperBand;
      result[i] = { supertrend: st, direction };
      prevST = st;
      prevUpperBand = upperBand;
      prevLowerBand = lowerBand;
    }

    return result;
  }
}

export default SuperTrend;
