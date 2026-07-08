/**
 * StructureEngine — Algorithmic detection layer.
 * Handles: swing points, HH/HL/LH/LL, BOS/CHoCH, Order Blocks, FVGs,
 * liquidity sweeps, pivot points, divergence, candlestick & chart patterns,
 * and statistical engine (z-score, correlation).
 */

// ─── Swing Point & Market Structure ──────────────────────────────────────────

/**
 * Detects swing highs and lows using a left/right look-around.
 * @param {object[]} candles
 * @param {number} strength - bars each side that must be lower/higher
 * @returns {{ swingHighs: number[], swingLows: number[] }}
 *   Arrays indexed by candle position; value = price or null.
 */
export function detectSwings(candles, strength = 3) {
  const n = candles.length;
  const swingHighs = new Array(n).fill(null);
  const swingLows  = new Array(n).fill(null);

  for (let i = strength; i < n - strength; i++) {
    const c = candles[i];
    let isHigh = true, isLow = true;
    for (let j = 1; j <= strength; j++) {
      if (candles[i - j].high >= c.high || candles[i + j].high >= c.high) isHigh = false;
      if (candles[i - j].low  <= c.low  || candles[i + j].low  <= c.low)  isLow  = false;
    }
    if (isHigh) swingHighs[i] = c.high;
    if (isLow)  swingLows[i]  = c.low;
  }

  return { swingHighs, swingLows };
}

/**
 * Builds HH/HL/LH/LL sequence from swing arrays.
 * @returns {{ structure: string[], pivots: { idx, type, price }[] }}
 */
export function detectMarketStructure(candles, strength = 3) {
  const { swingHighs, swingLows } = detectSwings(candles, strength);
  const pivots = [];

  for (let i = 0; i < candles.length; i++) {
    if (swingHighs[i] !== null) pivots.push({ idx: i, type: 'H', price: swingHighs[i] });
    if (swingLows[i]  !== null) pivots.push({ idx: i, type: 'L', price: swingLows[i] });
  }

  pivots.sort((a, b) => a.idx - b.idx);
  const structure = [];

  let lastH = null, lastL = null;
  for (const p of pivots) {
    if (p.type === 'H') {
      p.label = lastH === null ? 'H' : p.price > lastH ? 'HH' : 'LH';
      lastH = p.price;
    } else {
      p.label = lastL === null ? 'L' : p.price > lastL ? 'HL' : 'LL';
      lastL = p.price;
    }
    structure.push(p.label);
  }

  return { pivots, structure };
}

// ─── BOS / CHoCH ─────────────────────────────────────────────────────────────

/**
 * Detects Break of Structure (BOS) and Change of Character (CHoCH).
 * @returns {{ events: { idx, type, price }[] }}
 */
export function detectBOSCHoCH(candles, strength = 3) {
  const { pivots } = detectMarketStructure(candles, strength);
  const events = [];

  let bullish = true; // assumed initial bias
  for (let i = 1; i < pivots.length; i++) {
    const cur = pivots[i], prev = pivots[i - 1];
    if (cur.type === 'H') {
      if (cur.price > prev.price && bullish)  events.push({ idx: cur.idx, type: 'BOS_bull', price: cur.price });
      if (cur.price > prev.price && !bullish) { events.push({ idx: cur.idx, type: 'CHoCH_bull', price: cur.price }); bullish = true; }
    } else {
      if (cur.price < prev.price && !bullish) events.push({ idx: cur.idx, type: 'BOS_bear', price: cur.price });
      if (cur.price < prev.price && bullish)  { events.push({ idx: cur.idx, type: 'CHoCH_bear', price: cur.price }); bullish = false; }
    }
  }

  return { events };
}

// ─── Order Blocks, FVGs, Liquidity ───────────────────────────────────────────

/**
 * Detects bullish/bearish Order Blocks (last opposing candle before impulse).
 */
export function detectOrderBlocks(candles, lookback = 5) {
  const blocks = [];
  for (let i = lookback; i < candles.length - 1; i++) {
    const c = candles[i];
    const next = candles[i + 1];
    // Bullish OB: bearish candle followed by strong bullish impulse
    if (c.close < c.open && next.close > c.high) {
      blocks.push({ idx: i, type: 'bullOB', top: c.open, bottom: c.close });
    }
    // Bearish OB: bullish candle followed by strong bearish impulse
    if (c.close > c.open && next.close < c.low) {
      blocks.push({ idx: i, type: 'bearOB', top: c.close, bottom: c.open });
    }
  }
  return blocks;
}

/**
 * Detects Fair Value Gaps (3-candle imbalance).
 */
export function detectFVGs(candles) {
  const fvgs = [];
  for (let i = 1; i < candles.length - 1; i++) {
    const prev = candles[i - 1], next = candles[i + 1];
    // Bullish FVG: gap between prev high and next low
    if (next.low > prev.high) {
      fvgs.push({ idx: i, type: 'bullFVG', top: next.low, bottom: prev.high });
    }
    // Bearish FVG: gap between next high and prev low
    if (next.high < prev.low) {
      fvgs.push({ idx: i, type: 'bearFVG', top: prev.low, bottom: next.high });
    }
  }
  return fvgs;
}

/**
 * Detects liquidity sweeps (equal highs/lows + wick beyond then reversal).
 */
export function detectLiquiditySweeps(candles, lookback = 20, tolerance = 0.001) {
  const sweeps = [];
  for (let i = lookback; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles.slice(i - lookback, i);

    const eqHighs = prev.filter(p => Math.abs(p.high - c.high) / c.high < tolerance);
    const eqLows  = prev.filter(p => Math.abs(p.low  - c.low)  / c.low  < tolerance);

    if (eqHighs.length >= 2 && c.close < c.open) {
      sweeps.push({ idx: i, type: 'highSweep', level: c.high });
    }
    if (eqLows.length >= 2 && c.close > c.open) {
      sweeps.push({ idx: i, type: 'lowSweep', level: c.low });
    }
  }
  return sweeps;
}

// ─── Pivot Points ─────────────────────────────────────────────────────────────

/**
 * Computes Classic, Camarilla, and Fibonacci pivot levels from the prior candle.
 * @returns {{ classic, camarilla, fibonacci }}
 */
export function computePivotPoints(prevCandle) {
  const { high: H, low: L, close: C } = prevCandle;
  const P = (H + L + C) / 3;
  const R = H - L;

  return {
    classic: {
      PP: P,
      R1: 2 * P - L, R2: P + R, R3: H + 2 * (P - L),
      S1: 2 * P - H, S2: P - R, S3: L - 2 * (H - P)
    },
    camarilla: {
      PP: P,
      R1: C + R * 1.1 / 12, R2: C + R * 1.1 / 6,
      R3: C + R * 1.1 / 4,  R4: C + R * 1.1 / 2,
      S1: C - R * 1.1 / 12, S2: C - R * 1.1 / 6,
      S3: C - R * 1.1 / 4,  S4: C - R * 1.1 / 2
    },
    fibonacci: {
      PP: P,
      R1: P + 0.382 * R, R2: P + 0.618 * R, R3: P + R,
      S1: P - 0.382 * R, S2: P - 0.618 * R, S3: P - R
    }
  };
}

// ─── Candlestick Patterns ─────────────────────────────────────────────────────

const isGreen = c => c.close > c.open;
const isRed   = c => c.close < c.open;
const body    = c => Math.abs(c.close - c.open);
const range   = c => c.high - c.low;

/**
 * Detects 13 candlestick patterns on the most recent candles.
 * @returns {string[]} List of matched pattern names.
 */
export function detectCandlestickPatterns(candles) {
  const matched = [];
  const n = candles.length;
  if (n < 3) return matched;

  const c1 = candles[n - 1];
  const c2 = candles[n - 2];
  const c3 = candles[n - 3];

  // 1. Doji
  if (range(c1) > 0 && body(c1) / range(c1) < 0.05) matched.push('Doji');

  // 2. Hammer
  const lowerWick1 = Math.min(c1.open, c1.close) - c1.low;
  const upperWick1 = c1.high - Math.max(c1.open, c1.close);
  if (lowerWick1 >= 2 * body(c1) && upperWick1 <= 0.1 * body(c1) && body(c1) > 0) matched.push('Hammer');

  // 3. Inverted Hammer
  if (upperWick1 >= 2 * body(c1) && lowerWick1 <= 0.1 * body(c1) && body(c1) > 0) matched.push('Inverted Hammer');

  // 4. Shooting Star
  if (isRed(c1) && upperWick1 >= 2 * body(c1) && lowerWick1 < body(c1) * 0.1) matched.push('Shooting Star');

  // 5. Hanging Man
  if (isRed(c1) && lowerWick1 >= 2 * body(c1) && upperWick1 < body(c1) * 0.1) matched.push('Hanging Man');

  // 6. Bullish Engulfing
  if (isRed(c2) && isGreen(c1) && c1.open <= c2.close && c1.close >= c2.open && body(c1) > body(c2))
    matched.push('Bullish Engulfing');

  // 7. Bearish Engulfing
  if (isGreen(c2) && isRed(c1) && c1.open >= c2.close && c1.close <= c2.open && body(c1) > body(c2))
    matched.push('Bearish Engulfing');

  // 8. Bullish Harami
  if (isRed(c2) && isGreen(c1) && c1.open > c2.close && c1.close < c2.open && body(c1) < body(c2))
    matched.push('Bullish Harami');

  // 9. Bearish Harami
  if (isGreen(c2) && isRed(c1) && c1.open < c2.close && c1.close > c2.open && body(c1) < body(c2))
    matched.push('Bearish Harami');

  // 10. Morning Star
  if (isRed(c3) && body(c2) < body(c3) * 0.3 && isGreen(c1) && c1.close > (c3.open + c3.close) / 2)
    matched.push('Morning Star');

  // 11. Evening Star
  if (isGreen(c3) && body(c2) < body(c3) * 0.3 && isRed(c1) && c1.close < (c3.open + c3.close) / 2)
    matched.push('Evening Star');

  // 12. Three White Soldiers
  if (isGreen(c1) && isGreen(c2) && isGreen(c3) && c1.close > c2.close && c2.close > c3.close &&
      c1.open > c2.open && c2.open > c3.open) matched.push('Three White Soldiers');

  // 13. Three Black Crows
  if (isRed(c1) && isRed(c2) && isRed(c3) && c1.close < c2.close && c2.close < c3.close &&
      c1.open < c2.open && c2.open < c3.open) matched.push('Three Black Crows');

  // 14. Bullish Wick Rejection (Long Lower Wick / Pin Bar)
  if (range(c1) > 0 && lowerWick1 >= 0.65 * range(c1) && upperWick1 <= 0.15 * range(c1)) {
    matched.push('Bullish Wick Rejection');
  }

  // 15. Bearish Wick Rejection (Long Upper Wick)
  if (range(c1) > 0 && upperWick1 >= 0.65 * range(c1) && lowerWick1 <= 0.15 * range(c1)) {
    matched.push('Bearish Wick Rejection');
  }

  return matched;
}

// ─── Chart Patterns ───────────────────────────────────────────────────────────

/**
 * Detects 14 chart patterns using swing high/low pivots.
 * @returns {string[]} List of matched pattern names.
 */
export function detectChartPatterns(candles, strength = 3) {
  const { pivots } = detectMarketStructure(candles, strength);
  const matched = [];
  if (pivots.length < 5) return matched;

  const highs = pivots.filter(p => p.type === 'H').slice(-6);
  const lows  = pivots.filter(p => p.type === 'L').slice(-6);

  const asc  = (arr) => arr.every((v, i) => i === 0 || v.price >= arr[i - 1].price);
  const desc = (arr) => arr.every((v, i) => i === 0 || v.price <= arr[i - 1].price);

  // 1. Ascending Triangle
  if (highs.length >= 2 && lows.length >= 2) {
    const topFlat = Math.abs(highs[highs.length - 1].price - highs[highs.length - 2].price) / highs[highs.length - 1].price < 0.005;
    if (topFlat && asc(lows.slice(-3))) matched.push('Ascending Triangle');
  }

  // 2. Descending Triangle
  if (highs.length >= 2 && lows.length >= 2) {
    const botFlat = Math.abs(lows[lows.length - 1].price - lows[lows.length - 2].price) / lows[lows.length - 1].price < 0.005;
    if (botFlat && desc(highs.slice(-3))) matched.push('Descending Triangle');
  }

  // 3. Symmetrical Triangle
  if (desc(highs.slice(-3)) && asc(lows.slice(-3))) matched.push('Symmetrical Triangle');

  // 4. Double Top
  if (highs.length >= 2) {
    const h1 = highs[highs.length - 2], h2 = highs[highs.length - 1];
    if (Math.abs(h1.price - h2.price) / h1.price < 0.01 && lows.some(l => l.idx > h1.idx && l.idx < h2.idx))
      matched.push('Double Top');
  }

  // 5. Double Bottom
  if (lows.length >= 2) {
    const l1 = lows[lows.length - 2], l2 = lows[lows.length - 1];
    if (Math.abs(l1.price - l2.price) / l1.price < 0.01 && highs.some(h => h.idx > l1.idx && h.idx < l2.idx))
      matched.push('Double Bottom');
  }

  // 6. Head and Shoulders
  if (highs.length >= 3) {
    const [left, head, right] = highs.slice(-3);
    if (head.price > left.price && head.price > right.price &&
        Math.abs(left.price - right.price) / left.price < 0.03)
      matched.push('Head and Shoulders');
  }

  // 7. Inverse Head and Shoulders
  if (lows.length >= 3) {
    const [left, head, right] = lows.slice(-3);
    if (head.price < left.price && head.price < right.price &&
        Math.abs(left.price - right.price) / left.price < 0.03)
      matched.push('Inverse Head and Shoulders');
  }

  // 8. Rising Wedge (bearish)
  if (highs.length >= 3 && lows.length >= 3 && asc(highs.slice(-3)) && asc(lows.slice(-3))) {
    const highSlope = (highs[highs.length - 1].price - highs[highs.length - 3].price);
    const lowSlope  = (lows[lows.length - 1].price  - lows[lows.length - 3].price);
    if (lowSlope > highSlope) matched.push('Rising Wedge');
  }

  // 9. Falling Wedge (bullish)
  if (highs.length >= 3 && lows.length >= 3 && desc(highs.slice(-3)) && desc(lows.slice(-3))) {
    const highSlope = (highs[highs.length - 3].price - highs[highs.length - 1].price);
    const lowSlope  = (lows[lows.length - 3].price  - lows[lows.length - 1].price);
    if (highSlope > lowSlope) matched.push('Falling Wedge');
  }

  // 10. Bullish Flag
  if (highs.length >= 2 && lows.length >= 2 && desc(highs.slice(-2)) && desc(lows.slice(-2))) {
    const priorMove = candles[highs[highs.length - 2].idx].close - candles[lows[lows.length - 2].idx].close;
    if (priorMove > 0) matched.push('Bullish Flag');
  }

  // 11. Bearish Flag
  if (highs.length >= 2 && lows.length >= 2 && asc(highs.slice(-2)) && asc(lows.slice(-2))) {
    const priorMove = candles[lows[lows.length - 2].idx].close - candles[highs[highs.length - 2].idx].close;
    if (priorMove > 0) matched.push('Bearish Flag');
  }

  // 12. Cup and Handle (U-shaped lows with small pullback)
  if (lows.length >= 3) {
    const [l1, l2, l3] = lows.slice(-3);
    if (l1.price > l2.price && l3.price > l2.price &&
        Math.abs(l1.price - l3.price) / l1.price < 0.05)
      matched.push('Cup and Handle');
  }

  // 13. Triple Top
  if (highs.length >= 3) {
    const [h1, h2, h3] = highs.slice(-3);
    if (Math.abs(h1.price - h2.price) / h1.price < 0.01 &&
        Math.abs(h2.price - h3.price) / h2.price < 0.01)
      matched.push('Triple Top');
  }

  // 14. Triple Bottom
  if (lows.length >= 3) {
    const [l1, l2, l3] = lows.slice(-3);
    if (Math.abs(l1.price - l2.price) / l1.price < 0.01 &&
        Math.abs(l2.price - l3.price) / l2.price < 0.01)
      matched.push('Triple Bottom');
  }

  return matched;
}

// ─── Divergence Detector ──────────────────────────────────────────────────────

/**
 * Detects regular and hidden divergence between price and an oscillator series.
 * @param {object[]} candles
 * @param {number[]} oscillator - per-candle values (e.g. RSI, MACD histogram, OBV)
 * @param {number} strength - swing detection strength
 * @returns {{ regular: string[], hidden: string[] }}
 */
export function detectDivergence(candles, oscillator, strength = 3) {
  const n = candles.length;
  const priceHighs = [], priceLows = [];
  const oscHighs = [], oscLows = [];

  for (let i = strength; i < n - strength; i++) {
    const priceIsHigh = candles.slice(i - strength, i).every(c => c.high <= candles[i].high) &&
                        candles.slice(i + 1, i + strength + 1).every(c => c.high <= candles[i].high);
    const priceIsLow  = candles.slice(i - strength, i).every(c => c.low >= candles[i].low) &&
                        candles.slice(i + 1, i + strength + 1).every(c => c.low >= candles[i].low);

    const oscVal = oscillator[i];
    if (oscVal === null || oscVal === undefined) continue;

    const oscIsHigh = oscillator.slice(i - strength, i).every(v => v !== null && v <= oscVal) &&
                      oscillator.slice(i + 1, i + strength + 1).every(v => v !== null && v <= oscVal);
    const oscIsLow  = oscillator.slice(i - strength, i).every(v => v !== null && v >= oscVal) &&
                      oscillator.slice(i + 1, i + strength + 1).every(v => v !== null && v >= oscVal);

    if (priceIsHigh) priceHighs.push({ idx: i, price: candles[i].high });
    if (priceIsLow)  priceLows.push({  idx: i, price: candles[i].low });
    if (oscIsHigh)   oscHighs.push({   idx: i, val: oscVal });
    if (oscIsLow)    oscLows.push({    idx: i, val: oscVal });
  }

  const regular = [], hidden = [];

  // Bearish regular: price HH, osc LH
  if (priceHighs.length >= 2 && oscHighs.length >= 2) {
    const [pH1, pH2] = priceHighs.slice(-2);
    const [oH1, oH2] = oscHighs.slice(-2);
    if (pH2.price > pH1.price && oH2.val < oH1.val) regular.push('Bearish Regular Divergence');
    if (pH2.price < pH1.price && oH2.val > oH1.val) hidden.push('Bearish Hidden Divergence');
  }

  // Bullish regular: price LL, osc HL
  if (priceLows.length >= 2 && oscLows.length >= 2) {
    const [pL1, pL2] = priceLows.slice(-2);
    const [oL1, oL2] = oscLows.slice(-2);
    if (pL2.price < pL1.price && oL2.val > oL1.val) regular.push('Bullish Regular Divergence');
    if (pL2.price > pL1.price && oL2.val < oL1.val) hidden.push('Bullish Hidden Divergence');
  }

  return { regular, hidden };
}

// ─── Statistical Engine ───────────────────────────────────────────────────────

/**
 * Rolling z-score of close prices over a given window.
 * @returns {number[]} z-score per candle (null for immature periods)
 */
export function rollingZScore(candles, period = 20) {
  const result = new Array(candles.length).fill(null);
  const prices = candles.map(c => c.close);

  for (let i = period - 1; i < prices.length; i++) {
    const slice = prices.slice(i - period + 1, i + 1);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const stdDev = Math.sqrt(slice.reduce((s, v) => s + (v - mean) ** 2, 0) / period);
    result[i] = stdDev > 0 ? (prices[i] - mean) / stdDev : 0;
  }

  return result;
}

/**
 * Pearson correlation coefficient between two price series over a rolling window.
 * @param {object[]} candlesA
 * @param {object[]} candlesB
 * @param {number} period
 * @returns {number[]} Correlation per candle (null for immature periods)
 */
export function rollingCorrelation(candlesA, candlesB, period = 20) {
  const n = Math.min(candlesA.length, candlesB.length);
  const result = new Array(n).fill(null);
  const A = candlesA.map(c => c.close);
  const B = candlesB.map(c => c.close);

  for (let i = period - 1; i < n; i++) {
    const a = A.slice(i - period + 1, i + 1);
    const b = B.slice(i - period + 1, i + 1);
    const meanA = a.reduce((s, v) => s + v, 0) / period;
    const meanB = b.reduce((s, v) => s + v, 0) / period;
    let num = 0, dA = 0, dB = 0;
    for (let j = 0; j < period; j++) {
      const da = a[j] - meanA, db = b[j] - meanB;
      num += da * db;
      dA  += da * da;
      dB  += db * db;
    }
    result[i] = dA > 0 && dB > 0 ? num / Math.sqrt(dA * dB) : 0;
  }

  return result;
}
