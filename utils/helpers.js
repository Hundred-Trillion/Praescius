/**
 * Helpers utility module for Praescius Market Observer.
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
    const prefix = `[Praescius][${time}][${this.namespace}]`;
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

export function extractJSON(str) {
  const firstBrace = str.indexOf('{');
  const firstBracket = str.indexOf('[');
  let start = -1;
  if (firstBrace !== -1 && firstBracket !== -1) {
    start = Math.min(firstBrace, firstBracket);
  } else {
    start = firstBrace !== -1 ? firstBrace : firstBracket;
  }
  if (start === -1) return null;
  
  let candidate = str.substring(start);
  while (candidate.length > 0) {
    try {
      const parsed = JSON.parse(candidate);
      return parsed;
    } catch (e) {
      candidate = candidate.slice(0, -1);
    }
  }
  return null;
}


