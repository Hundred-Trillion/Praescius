/**
 * True Strength Index (TSI) plugin.
 * TSI = 100 * (Double EMA of Price Change) / (Double EMA of |Price Change|)
 * Returns: { tsi, signal }
 */

import BaseIndicator from './baseIndicator.js';

export class TSI extends BaseIndicator {
  constructor() {
    super('TSI');
  }

  _ema(arr, period) {
    const k = 2 / (period + 1);
    const result = [];
    let prev = arr[0];
    result.push(prev);
    for (let i = 1; i < arr.length; i++) {
      prev = arr[i] * k + prev * (1 - k);
      result.push(prev);
    }
    return result;
  }

  calculate(candles, params = {}) {
    const longPeriod = params.longPeriod || 25;
    const shortPeriod = params.shortPeriod || 13;
    const signalPeriod = params.signalPeriod || 7;
    const prices = candles.map(c => c.close);
    const result = new Array(candles.length).fill(null);

    const pc = [0]; // price changes
    const apc = [0]; // absolute price changes
    for (let i = 1; i < prices.length; i++) {
      pc.push(prices[i] - prices[i - 1]);
      apc.push(Math.abs(prices[i] - prices[i - 1]));
    }

    const ema1 = this._ema(pc, longPeriod);
    const ema2 = this._ema(ema1, shortPeriod);
    const absEma1 = this._ema(apc, longPeriod);
    const absEma2 = this._ema(absEma1, shortPeriod);

    const tsiValues = ema2.map((v, i) =>
      absEma2[i] !== 0 ? 100 * (v / absEma2[i]) : 0
    );

    const signalEma = this._ema(tsiValues, signalPeriod);
    const minIdx = longPeriod + shortPeriod;

    for (let i = minIdx; i < candles.length; i++) {
      result[i] = { tsi: tsiValues[i], signal: signalEma[i] };
    }

    return result;
  }
}

export default TSI;
