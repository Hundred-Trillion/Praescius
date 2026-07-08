/**
 * Ichimoku Cloud plugin.
 * Returns per candle: { tenkan, kijun, senkouA, senkouB, chikou }
 * Standard periods: 9, 26, 52.
 */

import BaseIndicator from './baseIndicator.js';

export class Ichimoku extends BaseIndicator {
  constructor() {
    super('Ichimoku');
  }

  _midpoint(candles, idx, period) {
    const slice = candles.slice(Math.max(0, idx - period + 1), idx + 1);
    const high = Math.max(...slice.map(c => c.high));
    const low = Math.min(...slice.map(c => c.low));
    return (high + low) / 2;
  }

  calculate(candles, params = {}) {
    const tenkanPeriod = params.tenkanPeriod || 9;
    const kijunPeriod = params.kijunPeriod || 26;
    const senkouBPeriod = params.senkouBPeriod || 52;
    const displacement = params.displacement || 26;
    const result = new Array(candles.length).fill(null);

    for (let i = 0; i < candles.length; i++) {
      const tenkan = i >= tenkanPeriod - 1 ? this._midpoint(candles, i, tenkanPeriod) : null;
      const kijun = i >= kijunPeriod - 1 ? this._midpoint(candles, i, kijunPeriod) : null;
      const senkouA = tenkan !== null && kijun !== null ? (tenkan + kijun) / 2 : null;
      const senkouB = i >= senkouBPeriod - 1 ? this._midpoint(candles, i, senkouBPeriod) : null;
      const chikou = candles[i].close; // plotted `displacement` bars back

      result[i] = { tenkan, kijun, senkouA, senkouB, chikou };
    }

    return result;
  }
}

export default Ichimoku;
