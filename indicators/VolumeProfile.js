/**
 * Volume Profile plugin.
 * Computes POC (Point of Control) and value area (VAH/VAL) from the candle set.
 */

import BaseIndicator from './baseIndicator.js';

export class VolumeProfile extends BaseIndicator {
  constructor() {
    super('VolumeProfile');
  }

  calculate(candles, params = {}) {
    const bins = params.bins || 50;
    const vaPercent = params.vaPercent || 0.7;
    const low = Math.min(...candles.map(c => c.low));
    const high = Math.max(...candles.map(c => c.high));
    const range = high - low;
    if (range === 0) return new Array(candles.length).fill(null);

    const binWidth = range / bins;
    const histogram = new Array(bins).fill(0);

    for (const c of candles) {
      const vol = c.volume || 1;
      const tp = (c.high + c.low + c.close) / 3;
      const binIdx = Math.min(bins - 1, Math.floor((tp - low) / binWidth));
      histogram[binIdx] += vol;
    }

    const pocBin = histogram.indexOf(Math.max(...histogram));
    const poc = low + (pocBin + 0.5) * binWidth;
    const totalVol = histogram.reduce((a, b) => a + b, 0);
    const vaTarget = totalVol * vaPercent;

    let vaVol = histogram[pocBin];
    let lo = pocBin, hi = pocBin;
    while (vaVol < vaTarget && (lo > 0 || hi < bins - 1)) {
      const loNext = lo > 0 ? histogram[lo - 1] : -Infinity;
      const hiNext = hi < bins - 1 ? histogram[hi + 1] : -Infinity;
      if (loNext >= hiNext) { lo--; vaVol += histogram[lo]; }
      else { hi++; vaVol += histogram[hi]; }
    }

    const result = new Array(candles.length).fill(null);
    result[candles.length - 1] = {
      poc,
      vah: low + (hi + 1) * binWidth,
      val: low + lo * binWidth,
      histogram, binWidth, low
    };
    return result;
  }
}

export default VolumeProfile;
