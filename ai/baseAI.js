/**
 * Abstract base class for AI translation adapters.
 * Formulates structured output contracts for language models.
 */

export class BaseAI {
  constructor(name) {
    this.name = name;
    if (this.constructor === BaseAI) {
      throw new TypeError('Cannot instantiate BaseAI directly.');
    }
  }

  /**
   * Translates text prompts into structured rules objects.
   * @param {string} apiKey - Target service API key
   * @param {string} promptText - User query
   * @returns {Promise<object>} Parsed rule configuration
   */
  async translatePrompt(apiKey, promptText) {
    throw new Error('Method "translatePrompt()" must be implemented by subclasses.');
  }
}

export default BaseAI;
