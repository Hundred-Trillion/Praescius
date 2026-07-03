/**
 * Abstract base class for indicators.
 * Establishes contract patterns for calculation plugins.
 */

export class BaseIndicator {
  /**
   * @param {string} name - Unique indicator name
   */
  constructor(name) {
    this.name = name;
    if (this.constructor === BaseIndicator) {
      throw new TypeError('Cannot instantiate BaseIndicator directly.');
    }
  }

  /**
   * Computes the indicator series over the historical candles data.
   * @param {object[]} candles - Array of candle objects
   * @param {object} params - Config parameters (e.g. period)
   * @returns {any[]} Array of indicator values matching input indices
   */
  calculate(candles, params) {
    throw new Error('Method "calculate()" must be implemented by subclasses.');
  }
}

export default BaseIndicator;
