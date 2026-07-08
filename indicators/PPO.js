/**
 * Percentage Price Oscillator (PPO) plugin.
 * PPO = ((EMA(fast) - EMA(slow)) / EMA(slow)) * 100
 * Returns: { ppo, signal, histogram }
 */

import BaseIndicator from './baseIndicator.js';

export class PPO extends BaseIndicator {
  constructor() {
    super('PPO');
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
    const fastPeriod = params.fastPeriod || 12;
    const slowPeriod = params.slowPeriod || 26;
    const signalPeriod = params.signalPeriod || 9;
    const prices = candles.map(c => c.close);
    const result = new Array(candles.length).fill(null);

    const fast = this._ema(prices, fastPeriod);
    const slow = this._ema(prices, slowPeriod);

    const ppoLine = fast.map((f, i) => slow[i] !== 0 ? ((f - slow[i]) / slow[i]) * 100 : 0);
    const signal = this._ema(ppoLine, signalPeriod);

    const minIdx = slowPeriod + signalPeriod;
    for (let i = minIdx; i < candles.length; i++) {
      result[i] = {
        ppo: ppoLine[i],
        signal: signal[i],
        histogram: ppoLine[i] - signal[i]
      };
    }

    return result;
  }
}

export default PPO;
