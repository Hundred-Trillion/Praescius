/**
 * Chandelier Exit plugin.
 * Long Exit = Highest High(period) - mult * ATR
 * Short Exit = Lowest Low(period) + mult * ATR
 * Returns: { longExit, shortExit, direction } per candle.
 */

import BaseIndicator from './baseIndicator.js';
import ATR from './ATR.js';

export class ChandelierExit extends BaseIndicator {
  constructor() {
    super('ChandelierExit');
    this.atrCalc = new ATR();
  }

  calculate(candles, params = {}) {
    const period = params.period || 22;
    const mult = params.mult || 3;
    const result = new Array(candles.length).fill(null);
    const atrValues = this.atrCalc.calculate(candles, { period });

    let direction = 1;
    let prevLongExit = null;
    let prevShortExit = null;

    for (let i = period; i < candles.length; i++) {
      const atr = atrValues[i];
      if (atr === null) continue;

      const slice = candles.slice(i - period + 1, i + 1);
      const highestHigh = Math.max(...slice.map(c => c.high));
      const lowestLow = Math.min(...slice.map(c => c.low));

      let longExit = highestHigh - mult * atr;
      let shortExit = lowestLow + mult * atr;

      if (prevLongExit !== null) longExit = Math.max(longExit, prevLongExit);
      if (prevShortExit !== null) shortExit = Math.min(shortExit, prevShortExit);

      const close = candles[i].close;
      if (direction === 1 && close < longExit) direction = -1;
      else if (direction === -1 && close > shortExit) direction = 1;

      result[i] = { longExit, shortExit, direction };
      prevLongExit = longExit;
      prevShortExit = shortExit;
    }

    return result;
  }
}

export default ChandelierExit;
