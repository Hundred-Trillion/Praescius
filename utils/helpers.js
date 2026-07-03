/**
 * Helpers utility module for Aetheris Market Observer.
 * Contains indicator calculation logic and debugging log helpers.
 */

/**
 * Normalizes trading symbol/instrument aliases consistently across all providers.
 * @param {string} rawSymbol 
 * @returns {string} Normalized symbol
 */
export function normalizeSymbol(rawSymbol) {
  if (!rawSymbol) return 'UNKNOWN';
  let sym = String(rawSymbol).toUpperCase().trim();
  
  // Strip exchange prefix if present, e.g. "BINANCE:BTCUSDT" -> "BTCUSDT"
  if (sym.includes(':')) {
    sym = sym.split(':')[1];
  }

  // Handle OTC suffix
  let isOtc = false;
  if (sym.endsWith('OTC') || sym.includes('/OTC') || sym.includes('-OTC') || sym.includes('_OTC')) {
    isOtc = true;
    sym = sym.replace(/\/OTC|-OTC|_OTC|OTC$/, '');
  }

  // Remove whitespace and underscores
  sym = sym.replace(/\s+/g, '').replace(/_/g, '/');

  // Strip leading/trailing slashes before slash checks
  sym = sym.replace(/\/+/g, '/').replace(/^\/|\/$/g, '');

  // Normalize specific instruments
  if (sym === 'GOLD' || sym === 'XAUUSD' || sym === 'XAU' || sym === 'XAU/USD') {
    sym = 'XAU/USD';
  } else if (sym === 'SILVER' || sym === 'XAGUSD' || sym === 'XAG' || sym === 'XAG/USD') {
    sym = 'XAG/USD';
  } else if (sym === 'CRUDE' || sym === 'CRUDEOIL' || sym === 'USOIL') {
    sym = 'USOIL';
  }

  // Normalize crypto or forex pairs that don't have a slash
  if (!sym.includes('/')) {
    if (sym.endsWith('USDT') && sym.length > 4) {
      sym = `${sym.slice(0, -4)}/USDT`;
    } else if (sym.endsWith('USDC') && sym.length > 4) {
      sym = `${sym.slice(0, -4)}/USDC`;
    } else if (sym.endsWith('USD') && sym.length > 3) {
      sym = `${sym.slice(0, -3)}/USD`;
    } else if (sym.endsWith('EUR') && sym.length > 3) {
      sym = `${sym.slice(0, -3)}/EUR`;
    } else if (sym.length === 6) {
      sym = `${sym.substring(0, 3)}/${sym.substring(3, 6)}`;
    }
  }

  // Clean trailing slashes or duplicate slashes
  sym = sym.replace(/\/+/g, '/').replace(/^\/|\/$/g, '');

  return isOtc ? `${sym} (OTC)` : sym;
}


export const LogLevel = {
  INFO: 'INFO',
  WARN: 'WARN',
  ERROR: 'ERROR',
  DEBUG: 'DEBUG'
};

/**
 * Custom namespace logger for consistent console output.
 */
export class Logger {
  constructor(namespace) {
    this.namespace = namespace;
  }

  log(message, data = null, level = LogLevel.INFO) {
    const time = new Date().toLocaleTimeString();
    const prefix = `[QXObserver][${time}][${this.namespace}]`;
    const style = level === LogLevel.ERROR ? 'color: #ff1744; font-weight: bold;' :
                  level === LogLevel.WARN ? 'color: #ff9100; font-weight: bold;' :
                  level === LogLevel.DEBUG ? 'color: #9e9e9e;' :
                  'color: #00e676; font-weight: bold;';

    if (data) {
      console.log(`%c${prefix} ${message}`, style, data);
    } else {
      console.log(`%c${prefix} ${message}`, style);
    }
  }

  info(message, data = null) { this.log(message, data, LogLevel.INFO); }
  warn(message, data = null) { this.log(message, data, LogLevel.WARN); }
  error(message, data = null) { this.log(message, data, LogLevel.ERROR); }
  debug(message, data = null) { this.log(message, data, LogLevel.DEBUG); }
}

/**
 * Calculates Simple Moving Average (SMA).
 * @param {number[]} prices
 * @param {number} period
 * @returns {number[]} Array of SMA values matching the price array indices (null/NaN for indices < period - 1)
 */
export function calculateSMA(prices, period) {
  const sma = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) {
      sma.push(null);
      continue;
    }
    let sum = 0;
    for (let j = 0; j < period; j++) {
      sum += prices[i - j];
    }
    sma.push(sum / period);
  }
  return sma;
}

/**
 * Calculates Exponential Moving Average (EMA).
 * @param {number[]} prices
 * @param {number} period
 * @returns {number[]}
 */
export function calculateEMA(prices, period) {
  const ema = [];
  if (prices.length === 0) return ema;
  const k = 2 / (period + 1);
  let prevEma = prices[0];
  ema.push(prevEma);

  for (let i = 1; i < prices.length; i++) {
    const curEma = prices[i] * k + prevEma * (1 - k);
    ema.push(curEma);
    prevEma = curEma;
  }

  // Set the initial values that haven't matured to null
  for (let i = 0; i < Math.min(period - 1, prices.length); i++) {
    ema[i] = null;
  }
  return ema;
}

/**
 * Calculates Relative Strength Index (RSI).
 * @param {number[]} prices
 * @param {number} period
 * @returns {number[]}
 */
export function calculateRSI(prices, period = 14) {
  const rsi = new Array(prices.length).fill(null);
  if (prices.length <= period) return rsi;

  let avgGain = 0;
  let avgLoss = 0;

  // First RSI value calculation
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) {
      avgGain += change;
    } else {
      avgLoss += Math.abs(change);
    }
  }

  avgGain /= period;
  avgLoss /= period;

  let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
  rsi[period] = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));

  // Subsequent values using Wilder's smoothing technique
  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    let gain = 0;
    let loss = 0;
    if (change > 0) {
      gain = change;
    } else {
      loss = Math.abs(change);
    }

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
    rsi[i] = avgLoss === 0 ? 100 : 100 - (100 / (1 + rs));
  }

  return rsi;
}

/**
 * Checks for indicator crossovers between two series.
 * @param {number[]} seriesA - Main series (e.g. fast SMA)
 * @param {number[]} seriesB - Signal series (e.g. slow SMA or horizontal line)
 * @returns {'above' | 'below' | null}
 */
export function checkCrossover(seriesA, seriesB) {
  if (seriesA.length < 2 || seriesB.length < 2) return null;
  
  const lastIdx = seriesA.length - 1;
  const prevIdx = lastIdx - 1;

  const a1 = seriesA[lastIdx];
  const a0 = seriesA[prevIdx];
  
  // Handlers for scalar values vs arrays
  const b1 = Array.isArray(seriesB) ? seriesB[lastIdx] : seriesB;
  const b0 = Array.isArray(seriesB) ? seriesB[prevIdx] : seriesB;

  if (a0 === null || a1 === null || b0 === null || b1 === null) return null;

  if (a0 <= b0 && a1 > b1) return 'above'; // A crossed above B
  if (a0 >= b0 && a1 < b1) return 'below'; // A crossed below B

  return null;
}
