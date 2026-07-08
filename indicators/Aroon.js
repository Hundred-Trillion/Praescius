/**
 * Aroon Indicator plugin.
 * AroonUp = ((period - periods since highest high) / period) * 100
 * AroonDown = ((period - periods since lowest low) / period) * 100
 * Returns: { aroonUp, aroonDown, aroonOscillator } per candle.
 */

import BaseIndicator from './baseIndicator.js';

export class Aroon extends BaseIndicator {
  constructor() {
    super('Aroon');
  }

  calculate(candles, params = {}) {
    const period = params.period || 25;
    const result = new Array(candles.length).fill(null);

    for (let i = period; i < candles.length; i++) {
      const slice = candles.slice(i - period, i + 1);
      let highIdx = 0, lowIdx = 0;
      for (let j = 1; j <= period; j++) {
        if (slice[j].high >= slice[highIdx].high) highIdx = j;
        if (slice[j].low <= slice[lowIdx].low) lowIdx = j;
      }
      const aroonUp = ((highIdx) / period) * 100;
      const aroonDown = ((lowIdx) / period) * 100;
      result[i] = { aroonUp, aroonDown, aroonOscillator: aroonUp - aroonDown };
    }

    return result;
  }
}

export default Aroon;
