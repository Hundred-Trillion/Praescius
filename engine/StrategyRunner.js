import { STRATEGIES } from '../strategies/index.js';

export default class StrategyRunner {
  /**
   * Runs all available strategies on the provided historical candles and ticks.
   * @param {object[]} candles
   * @param {object[]} ticks
   * @returns {object} Object mapping strategy name to its result
   */
  static runAll(candles, ticks) {
    const results = {};
    for (const [name, strategy] of Object.entries(STRATEGIES)) {
      try {
        const res = strategy.evaluate(candles, ticks);
        results[name] = {
          name,
          ...res
        };
      } catch (err) {
        console.error(`[StrategyRunner] Error running ${name}:`, err);
      }
    }
    return results;
  }
}
