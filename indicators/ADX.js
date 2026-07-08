/**
 * Average Directional Index (ADX) + Directional Movement Index (DMI) plugin.
 * Returns: { adx, plusDI, minusDI } per candle.
 */

import BaseIndicator from './baseIndicator.js';

export class ADX extends BaseIndicator {
  constructor() {
    super('ADX');
  }

  calculate(candles, params = {}) {
    const period = params.period || 14;
    const result = new Array(candles.length).fill(null);
    if (candles.length <= period * 2) return result;

    const trArr = [];
    const plusDMArr = [];
    const minusDMArr = [];

    for (let i = 1; i < candles.length; i++) {
      const cur = candles[i], prev = candles[i - 1];
      const upMove = cur.high - prev.high;
      const downMove = prev.low - cur.low;
      trArr.push(Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close)));
      plusDMArr.push(upMove > downMove && upMove > 0 ? upMove : 0);
      minusDMArr.push(downMove > upMove && downMove > 0 ? downMove : 0);
    }

    // Wilder smooth
    const smooth = (arr) => {
      let s = arr.slice(0, period).reduce((a, b) => a + b, 0);
      const result = [s];
      for (let i = period; i < arr.length; i++) {
        s = s - s / period + arr[i];
        result.push(s);
      }
      return result;
    };

    const sTR = smooth(trArr);
    const sPlusDM = smooth(plusDMArr);
    const sMinusDM = smooth(minusDMArr);

    const plusDI = sPlusDM.map((v, i) => sTR[i] > 0 ? 100 * v / sTR[i] : 0);
    const minusDI = sMinusDM.map((v, i) => sTR[i] > 0 ? 100 * v / sTR[i] : 0);

    const dx = plusDI.map((v, i) => {
      const sum = v + minusDI[i];
      return sum > 0 ? 100 * Math.abs(v - minusDI[i]) / sum : 0;
    });

    // Smooth DX into ADX
    let adxVal = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
    const adxArr = [adxVal];
    for (let i = period; i < dx.length; i++) {
      adxVal = (adxVal * (period - 1) + dx[i]) / period;
      adxArr.push(adxVal);
    }

    const offset = period; // first candle with a value (0-based in trimmed arrays)
    for (let i = 0; i < adxArr.length; i++) {
      const candleIdx = i + period + 1; // real candle index
      if (candleIdx < candles.length) {
        result[candleIdx] = {
          adx: adxArr[i],
          plusDI: plusDI[i + period] ?? plusDI[plusDI.length - 1],
          minusDI: minusDI[i + period] ?? minusDI[minusDI.length - 1]
        };
      }
    }

    return result;
  }
}

export default ADX;
