/**
 * Local Rule Evaluation Engine.
 * Resolves values via indicator plugins.
 */

import RSI from '../indicators/RSI.js';
import EMA from '../indicators/EMA.js';
import SMA from '../indicators/SMA.js';
import MACD from '../indicators/MACD.js';
import ATR from '../indicators/ATR.js';
import VWAP from '../indicators/VWAP.js';

// Instantiate all plugin indicators
const INDICATOR_PLUGINS = {
  RSI: new RSI(),
  EMA: new EMA(),
  SMA: new SMA(),
  MACD: new MACD(),
  ATR: new ATR(),
  VWAP: new VWAP()
};

/**
 * Runs rule validation over historical candle streams.
 * @param {object[]} candles - Historical candles (sorted chronologically oldest to newest)
 * @param {object} rule - Compiled executable rule object
 * @returns {boolean}
 */
export function evaluateRule(candles, rule) {
  if (!candles || candles.length === 0) return false;
  if (!rule || !rule.conditions || rule.conditions.length === 0) return false;

  const results = rule.conditions.map(cond => evaluateCondition(candles, cond));
  const op = rule.operator || 'AND';

  if (op === 'AND') {
    return results.every(res => res === true);
  } else if (op === 'OR') {
    return results.some(res => res === true);
  } else if (op === 'NOT') {
    return !results[0];
  }

  return false;
}

/**
 * Validates a single compiled condition.
 */
function evaluateCondition(candles, cond) {
  try {
    const lastIdx = candles.length - 1;
    const current = candles[lastIdx];

    // Pattern conditions
    if (cond.type === 'pattern') {
      return checkPattern(candles, cond.pattern);
    }

    // Price threshold checks
    if (cond.indicator === 'Price') {
      if (cond.operator === 'crossover_above' || cond.operator === 'crossover_below') {
        const prev = candles[lastIdx - 1];
        if (!prev) return false;
        return cond.operator === 'crossover_above' ? 
               (prev.close <= cond.value && current.close > cond.value) :
               (prev.close >= cond.value && current.close < cond.value);
      }
      return compare(current.close, cond.operator, cond.value, candles);
    }

    // Advanced indicator checks
    const plugin = INDICATOR_PLUGINS[cond.indicator];
    if (!plugin) return false;

    const values = plugin.calculate(candles, cond);
    const currentVal = values[values.length - 1];

    if (currentVal === null || currentVal === undefined) return false;

    // Handle compound returns like MACD line structures
    if (cond.indicator === 'MACD') {
      const line = cond.targetLine || 'macd';
      const scalarValue = currentVal[line];
      if (scalarValue === null || scalarValue === undefined) return false;

      // Check for crossovers
      if (cond.operator === 'crossover_above' || cond.operator === 'crossover_below') {
        const prevVal = values[values.length - 2]?.[line];
        if (prevVal === null || prevVal === undefined) return false;
        return cond.operator === 'crossover_above' ? 
               (prevVal <= cond.value && scalarValue > cond.value) :
               (prevVal >= cond.value && scalarValue < cond.value);
      }
      return compare(scalarValue, cond.operator, cond.value, values.map(v => v?.[line]));
    }

    // Standard scalar indicators (RSI, SMA, EMA, ATR, VWAP)
    if (cond.operator === 'crossover_above' || cond.operator === 'crossover_below') {
      const prevVal = values[values.length - 2];
      if (prevVal === null || prevVal === undefined) return false;
      return cond.operator === 'crossover_above' ? 
             (prevVal <= cond.value && currentVal > cond.value) :
             (prevVal >= cond.value && currentVal < cond.value);
    }

    return compare(currentVal, cond.operator, cond.value, values);

  } catch (err) {
    console.error('[Evaluator] Failure evaluating condition:', cond, err);
  }
  return false;
}

/**
 * Basic comparison logic.
 */
function compare(val1, op, val2, series) {
  switch (op) {
    case '>': return val1 > val2;
    case '<': return val1 < val2;
    case '>=': return val1 >= val2;
    case '<=': return val1 <= val2;
    case '==': return val1 === val2;
    default: return false;
  }
}

/**
 * Candlestick pattern identifier.
 */
function checkPattern(candles, pattern) {
  if (candles.length < 3) return false;
  const len = candles.length;
  const c1 = candles[len - 1]; // latest
  const c2 = candles[len - 2];
  const c3 = candles[len - 3];

  const isGreen = (c) => c.close > c.open;
  const isRed = (c) => c.close < c.open;
  const body = (c) => Math.abs(c.close - c.open);

  switch (pattern) {
    case 'Three Bullish Candles':
      return isGreen(c1) && isGreen(c2) && isGreen(c3) &&
             c1.close > c2.close && c2.close > c3.close;

    case 'Three Bearish Candles':
      return isRed(c1) && isRed(c2) && isRed(c3) &&
             c1.close < c2.close && c2.close < c3.close;

    case 'Bullish Engulfing':
      return isRed(c2) && isGreen(c1) &&
             c1.open <= c2.close && c1.close >= c2.open &&
             body(c1) > body(c2);

    case 'Bearish Engulfing':
      return isGreen(c2) && isRed(c1) &&
             c1.open >= c2.close && c1.close <= c2.open &&
             body(c1) > body(c2);

    case 'Doji':
      const range = c1.high - c1.low;
      if (range === 0) return true;
      return body(c1) / range <= 0.05;

    case 'Hammer':
      const lowerShadow = Math.min(c1.open, c1.close) - c1.low;
      const upperShadow = c1.high - Math.max(c1.open, c1.close);
      const bSize = body(c1);
      return lowerShadow >= (2 * bSize) && upperShadow <= (0.1 * bSize);

    default:
      return false;
  }
}
