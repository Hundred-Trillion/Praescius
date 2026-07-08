/**
 * Advanced Logger Layer.
 * Supports log schema versioning and JSONL formatting.
 */

import { saveCandle, getCandleCount, saveLog, pruneDatabase } from '../storage/db.js';

export class AppLogger {
  constructor(db) {
    this.db = db;
    this.cachedStats = {
      totalLogged: 0,
      minPrice: Infinity,
      maxPrice: -Infinity,
      lastUpdate: null
    };
  }

  /**
   * Writes a schema-versioned candle block to IndexedDB.
   * @param {object} candle 
   */
  async logCandle(candle) {
    try {
      const res = await new Promise(resolve => chrome.storage.local.get(['settings'], resolve));
      if (res.settings && res.settings.loggingEnabled === false) return;

      const versioned = {
        schema: candle.schema || 1, // Schema Versioning
        provider: candle.provider || 'unknown', // Provider attribution
        tabId: candle.tabId || 'default', // Scoped Tab ID
        symbol: candle.symbol,
        timestamp: candle.timestamp,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        price: candle.price,
        volume: candle.volume || 0,
        timeframe: candle.timeframe || '1m',
        source: candle.source || 'direct'
      };

      await saveCandle(this.db, versioned);
      
      // Periodically prune database to restrict total allocation size
      if (this.cachedStats.totalLogged > 0 && this.cachedStats.totalLogged % 100 === 0) {
        pruneDatabase(this.db);
      }

      // Update statistics
      this.cachedStats.totalLogged++;
      if (versioned.price < this.cachedStats.minPrice) this.cachedStats.minPrice = versioned.price;
      if (versioned.price > this.cachedStats.maxPrice) this.cachedStats.maxPrice = versioned.price;
      this.cachedStats.lastUpdate = Date.now();
    } catch (err) {
      console.error('[AppLogger] Candle write failure:', err);
      await this.logSystemEvent(`Candle log failure: ${err.message}`, 'error', candle.provider || 'unknown', candle.tabId || 'default');
    }
  }

  /**
   * Log system events.
   */
  async logSystemEvent(message, type = 'info', provider = 'system', tabId = 'default') {
    try {
      await saveLog(this.db, message, type, provider, tabId);
    } catch (err) {
      console.error('[AppLogger] Log write failure:', err);
    }
  }

  /**
   * Log tick comparison data for WebSocket vs DOM analysis.
   */
  async logTickComparison(symbol, price, source, confidence, provider = 'unknown', tabId = 'default') {
    try {
      const entry = {
        t: Date.now(),
        p: price,
        source: source,
        confidence: confidence,
        symbol: symbol
      };
      await saveLog(this.db, JSON.stringify(entry), 'tick_comparison', provider, tabId);
    } catch (err) {
      // ignore
    }
  }

  /**
   * Fetch statistical aggregates.
   */
  async getStats() {
    try {
      const count = await getCandleCount(this.db);
      this.cachedStats.totalLogged = count;
    } catch (err) {
      // DB connection opening may fail if worker restarts
    }
    return { ...this.cachedStats };
  }

  /**
   * Converts database objects into JSON Lines (JSONL).
   * @param {object[]} candles 
   * @returns {string}
   */
  convertToJSONL(candles) {
    if (!candles || candles.length === 0) return '';
    return candles.map(c => JSON.stringify({
      schema: c.schema || 1,
      provider: c.provider || 'unknown',
      symbol: c.symbol,
      tf: c.timeframe,
      t: Math.floor(c.timestamp / 1000), // seconds
      timestamp_iso: new Date(c.timestamp).toISOString(),
      o: c.open,
      h: c.high,
      l: c.low,
      c: c.close,
      v: c.volume
    })).join('\n');
  }
}
export default AppLogger;
