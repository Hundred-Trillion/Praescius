/**
 * TRIX plugin.
 * TRIX = 1-period ROC of Triple-Smoothed EMA, expressed as percentage.
 * Returns: { trix, signal }
 */

import BaseIndicator from './baseIndicator.js';

export class TRIX extends BaseIndicator {
  constructor() {
    super('TRIX');
  }

  _ema(prices, period) {
    const k = 2 / (period + 1);
    const result = [prices[0]];
    for (let i = 1; i < prices.length; i++) {
      result.push(prices[i] * k + result[i - 1] * (1 - k));
    }
    return result;
  }

  calculate(candles, params = {}) {
    const period = params.period || 15;
    const signalPeriod = params.signalPeriod || 9;
    const prices = candles.map(c => c.close);
    const result = new Array(candles.length).fill(null);

    const ema1 = this._ema(prices, period);
    const ema2 = this._ema(ema1, period);
    const ema3 = this._ema(ema2, period);

    const trixLine = ema3.map((v, i) =>
      i === 0 || ema3[i - 1] === 0 ? 0 : ((v - ema3[i - 1]) / ema3[i - 1]) * 100
    );

    const signalLine = this._ema(trixLine, signalPeriod);
    const minIdx = period * 3;

    for (let i = minIdx; i < candles.length; i++) {
      result[i] = { trix: trixLine[i], signal: signalLine[i] };
    }

    return result;
  }
}

export default TRIX;
