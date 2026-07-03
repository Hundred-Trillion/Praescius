/**
 * Base class for all custom quantitative trading strategies.
 */
export default class BaseStrategy {
  constructor(name, description = '') {
    this.name = name;
    this.description = description;
  }

  /**
   * Evaluates the strategy logic.
   * @param {object[]} candles - Historical candle array (oldest to newest)
   * @param {object[]} ticks - Raw historical tick array (oldest to newest)
   * @returns {object} StrategyResult object
   */
  evaluate(candles, ticks) {
    return {
      triggered: false,
      confidence: 0,
      score: 0,
      reasons: [],
      metrics: {},
      risk: 0,
      cooldown: 0,
      direction: 'neutral'
    };
  }
}
