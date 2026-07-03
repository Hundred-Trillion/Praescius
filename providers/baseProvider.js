/**
 * Abstract Base Provider class.
 * All Aetheris Provider plugins must extend this class and implement its interface.
 */

export class BaseProvider {
  constructor(name) {
    this.name = name;
    this.selectors = [];
  }

  /**
   * Verifies if this provider matches the current environment URL or page title.
   * @param {string} url 
   * @param {string} title 
   * @returns {boolean}
   */
  matches(url, title) {
    throw new Error('matches(url, title) is required');
  }

  /**
   * Performs element and canvas environment discovery.
   * @returns {Promise<object>} Discovery result details
   */
  async discover() {
    throw new Error('discover() is required');
  }

  /**
   * Initializes interception listeners or socket monkeypatch bridges.
   */
  connect() {
    throw new Error('connect() is required');
  }

  /**
   * Retrieves logged historical candle records for technical indicator calculations.
   * @returns {Promise<object[]>} Array of uniform candles
   */
  async getCandles() {
    throw new Error('getCandles() is required');
  }

  /**
   * Retrieves active streaming ticks.
   * @returns {Promise<object[]>} Array of price points
   */
  async getTicks() {
    throw new Error('getTicks() is required');
  }

  /**
   * Gets the symbol name currently viewed on the chart.
   * @returns {string} active instrument symbol
   */
  getSymbol() {
    throw new Error('getSymbol() is required');
  }

  /**
   * De-registers listener hooks and cleans up resources.
   */
  disconnect() {
    throw new Error('disconnect() is required');
  }

  /**
   * Parses intercepted network stream payloads.
   * @param {string|ArrayBuffer} payload 
   * @param {'incoming'|'outgoing'} direction 
   * @returns {object|null} Unified candle structure
   */
  parse(payload, direction) {
    throw new Error('parse(payload, direction) is required');
  }
}

export default BaseProvider;
