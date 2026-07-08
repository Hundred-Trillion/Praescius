/**
 * Keltner Channel plugin.
 * Middle = EMA(close), Upper = EMA + mult * ATR, Lower = EMA - mult * ATR.
 * Returns: { upper, middle, lower } per candle.
 */

import BaseIndicator from './baseIndicator.js';
import ATR from './ATR.js';

export class KeltnerChannel extends BaseIndicator {
  constructor() {
    super('KeltnerChannel');
    this.atrCalc = new ATR();
  }

  calculate(candles, params = {}) {
    const period = params.period || 20;
    const atrPeriod = params.atrPeriod || 10;
    const mult = params.mult || 2;
    const result = new Array(candles.length).fill(null);
    const prices = candles.map(c => c.close);
    const atrValues = this.atrCalc.calculate(candles, { period: atrPeriod });

    const k = 2 / (period + 1);
    let ema = prices[0];
    const emaArr = [ema];
    for (let i = 1; i < prices.length; i++) {
      ema = prices[i] * k + ema * (1 - k);
      emaArr.push(ema);
    }

    for (let i = period; i < candles.length; i++) {
      const atr = atrValues[i];
      if (atr === null) continue;
      result[i] = {
        upper: emaArr[i] + mult * atr,
        middle: emaArr[i],
        lower: emaArr[i] - mult * atr
      };
    }

    return result;
  }
}

export default KeltnerChannel;
