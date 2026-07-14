/**
 * StrategyLibrary — Predefined alert strategy dataset for Ultra customers.
 *
 * Loads the 176-strategy JSON bundle and exposes a rich query API:
 *   getAll()            → all strategies
 *   getById(id)         → single strategy by numeric ID
 *   getByCategory(cat)  → filtered by category (Trend, Momentum, Pattern, etc.)
 *   search(query)       → text search across name, description, sub-category
 *   getByRisk(level)    → 'Low' | 'Medium' | 'High'
 *   getByTimeframe(tf)  → e.g. '1H', '4H', 'Daily'
 *   getByMarket(mkt)    → e.g. 'Universal', 'Crypto', 'Forex'
 *   getByIndicator(ind) → strategies that require a specific indicator
 *   getTopByConfidence(n) → top-N sorted by confidence score
 *   toRule(strategy)    → converts a library entry into a Praescius rule object
 */

export class StrategyLibrary {
  constructor() {
    this._strategies = [];
    this.version = '1.0.0';
    this.source = 'Trading_Strategy_Alert_Dataset.xlsx';
    this._loaded = false;
  }

  async load() {
    if (this._loaded) return;
    try {
      const url = chrome.runtime.getURL('strategies/library.json');
      const response = await fetch(url);
      const data = await response.json();
      this._strategies = (data.strategies || []).filter(s => s.id && s.strategyName);
      this.version = data.version || '1.0.0';
      this.source = data.source || 'Trading_Strategy_Alert_Dataset.xlsx';
      this._loaded = true;
    } catch (err) {
      console.error('[StrategyLibrary] Error fetching library.json:', err);
    }
  }

  /** @returns {object[]} All 176 strategies */
  getAll() {
    return this._strategies;
  }

  /** @returns {object|undefined} Single strategy by numeric ID */
  getById(id) {
    return this._strategies.find(s => s.id === id);
  }

  /** @returns {object[]} Strategies for a given category (case-insensitive) */
  getByCategory(category) {
    const q = category.toLowerCase();
    return this._strategies.filter(s => (s.category || '').toLowerCase() === q);
  }

  /** @returns {object[]} Text search across name, description, subCategory */
  search(query) {
    const q = query.toLowerCase();
    return this._strategies.filter(s =>
      (s.strategyName    || '').toLowerCase().includes(q) ||
      (s.description     || '').toLowerCase().includes(q) ||
      (s.subCategory     || '').toLowerCase().includes(q) ||
      (s.buySignal       || '').toLowerCase().includes(q) ||
      (s.sellSignal      || '').toLowerCase().includes(q)
    );
  }

  /** @returns {object[]} Strategies matching a risk level: 'Low'|'Medium'|'High' */
  getByRisk(level) {
    const q = level.toLowerCase();
    return this._strategies.filter(s => (s.riskLevel || '').toLowerCase() === q);
  }

  /**
   * @param {string} tf - Partial timeframe string, e.g. '1H', '4H', 'Daily'
   * @returns {object[]}
   */
  getByTimeframe(tf) {
    const q = tf.toLowerCase();
    return this._strategies.filter(s => (s.bestTimeframe || '').toLowerCase().includes(q));
  }

  /**
   * @param {string} mkt - Market name, e.g. 'Universal', 'Crypto', 'Forex'
   * @returns {object[]}
   */
  getByMarket(mkt) {
    const q = mkt.toLowerCase();
    return this._strategies.filter(s => (s.bestMarket || '').toLowerCase().includes(q));
  }

  /**
   * @param {string} indicator - Indicator name, e.g. 'RSI', 'MACD'
   * @returns {object[]} Strategies that list this indicator as required
   */
  getByIndicator(indicator) {
    const q = indicator.toLowerCase();
    return this._strategies.filter(s =>
      (s.requiredIndicators || '').toLowerCase().includes(q)
    );
  }

  /**
   * @param {number} n - Number of results
   * @returns {object[]} Top-N strategies sorted by confidence score descending
   */
  getTopByConfidence(n = 10) {
    return [...this._strategies]
      .filter(s => s.confidenceScore !== null && s.confidenceScore !== undefined)
      .sort((a, b) => {
        const aScore = parseFloat(String(a.confidenceScore)) || 0;
        const bScore = parseFloat(String(b.confidenceScore)) || 0;
        return bScore - aScore;
      })
      .slice(0, n);
  }

  /**
   * Returns stats summary for the UI.
   */
  getSummary() {
    const cats = {};
    for (const s of this._strategies) {
      const c = s.category || 'Unknown';
      cats[c] = (cats[c] || 0) + 1;
    }
    return {
      total: this._strategies.length,
      categories: cats,
      version: this.version,
      source: this.source
    };
  }

  /**
   * Converts a library strategy entry into a basic Praescius rule object
   * that can be saved and evaluated by the rules engine.
   * @param {object} strategy - A strategy from the library
   * @returns {object} Praescius rule-compatible object
   */
  toRule(strategy) {
    let parsedRule = null;
    try {
      if (strategy.jsonRule && typeof strategy.jsonRule === 'string') {
        parsedRule = JSON.parse(strategy.jsonRule);
      } else if (strategy.jsonRule && typeof strategy.jsonRule === 'object') {
        parsedRule = strategy.jsonRule;
      }
    } catch (_) {}

    let conditions = [];
    let operator = 'AND';

    if (parsedRule) {
      if (Array.isArray(parsedRule)) {
        conditions = parsedRule;
      } else if (Array.isArray(parsedRule.conditions)) {
        conditions = parsedRule.conditions;
        if (parsedRule.operator) operator = parsedRule.operator;
      } else {
        conditions = [parsedRule];
      }
    }

    return {
      id: `lib_${strategy.id}`,
      name: strategy.strategyName,
      description: strategy.description || '',
      category: strategy.category || 'General',
      conditions: conditions,
      operator: operator,
      notificationTitle: strategy.notificationTitle || strategy.strategyName,
      notificationMessage: strategy.notificationMessage || '',
      priority: strategy.priority || 'Medium',
      riskLevel: strategy.riskLevel || 'Medium',
      confidenceScore: parseFloat(String(strategy.confidenceScore)) || 60,
      expectedDirection: strategy.expectedDirection || 'Neutral',
      bestTimeframe: strategy.bestTimeframe || 'Any',
      bestMarket: strategy.bestMarket || 'Universal',
      requiredIndicators: strategy.requiredIndicators || '',
      isLibraryRule: true,
      enabled: true,
      createdAt: Date.now()
    };
  }
}

export const strategyLibrary = new StrategyLibrary();
export default strategyLibrary;
