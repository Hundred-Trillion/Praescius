/**
 * Abstract Base Provider class.
 * All Praescius Provider plugins must extend this class and implement its interface.
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
