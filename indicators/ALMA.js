/**
 * Arnaud Legoux Moving Average (ALMA) plugin.
 * Uses a Gaussian distribution centered towards the recent end of the window.
 * params.sigma controls distribution width; params.offset controls center position (0–1).
 */

import BaseIndicator from './baseIndicator.js';

export class ALMA extends BaseIndicator {
  constructor() {
    super('ALMA');
  }

  calculate(candles, params = {}) {
    const period = params.period || 21;
    const sigma = params.sigma || 6;
    const offset = params.offset !== undefined ? params.offset : 0.85;
    const prices = candles.map(c => c.close);
    const alma = new Array(prices.length).fill(null);

    const m = Math.floor(offset * (period - 1));
    const s = period / sigma;

    const weights = [];
    let wSum = 0;
    for (let i = 0; i < period; i++) {
      const w = Math.exp(-((i - m) ** 2) / (2 * s * s));
      weights.push(w);
      wSum += w;
    }

    for (let i = period - 1; i < prices.length; i++) {
      let sum = 0;
      for (let j = 0; j < period; j++) {
        sum += weights[j] * prices[i - period + 1 + j];
      }
      alma[i] = sum / wSum;
    }

    return alma;
  }
}

export default ALMA;
