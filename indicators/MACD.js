/**
 * Moving Average Convergence Divergence (MACD) plugin.
 */

import BaseIndicator from './baseIndicator.js';
import EMA from './EMA.js';

export class MACD extends BaseIndicator {
  constructor() {
    super('MACD');
    this.emaCalculator = new EMA();
  }

  calculate(candles, params = {}) {
    const fastPeriod = params.fastPeriod || 12;
    const slowPeriod = params.slowPeriod || 26;
    const signalPeriod = params.signalPeriod || 9;

    const prices = candles.map(c => c.close);
    const macdSeries = new Array(prices.length).fill(null);

    const fastEma = this.emaCalculator.calculate(candles, { period: fastPeriod });
    const slowEma = this.emaCalculator.calculate(candles, { period: slowPeriod });

    // 1. Calculate MACD Line = Fast EMA - Slow EMA
    const macdLine = [];
    for (let i = 0; i < prices.length; i++) {
      if (fastEma[i] === null || slowEma[i] === null) {
        macdLine.push(null);
      } else {
        macdLine.push(fastEma[i] - slowEma[i]);
      }
    }

    // 2. Calculate Signal Line (EMA of MACD Line)
    // We construct a mock candle list out of MACD Line to feed EMA calculate
    const macdCandles = macdLine.map((val, idx) => ({
      close: val === null ? prices[idx] : val // fallback during immature periods
    }));

    const signalLine = this.emaCalculator.calculate(macdCandles, { period: signalPeriod });

    // Set immature periods to null
    const startPeriod = Math.max(slowPeriod, fastPeriod) + signalPeriod;
    for (let i = 0; i < Math.min(startPeriod, prices.length); i++) {
      macdLine[i] = null;
      signalLine[i] = null;
    }

    // Return object containing all MACD lines
    // To match standard single array return, we return the MACD Line by default,
    // or expose them as fields on the array object
    const result = macdLine.map((val, idx) => {
      if (val === null || signalLine[idx] === null) return null;
      return {
        macd: val,
        signal: signalLine[idx],
        histogram: val - signalLine[idx]
      };
    });

    return result;
  }
}

export default MACD;
