/**
 * AI Provider Manager.
 * Orchestrates translation calls to chosen LLM backends or local regex parser.
 */

import { GeminiAI } from './gemini.js';
import { OpenAIClass } from './openai.js';
import { LocalAI } from './local.js';

class AIManager {
  constructor() {
    this.providers = {
      gemini: new GeminiAI(),
      openai: new OpenAIClass(),
      local: new LocalAI()
    };
  }

  /**
   * Translates text to rules based on selected settings.
   * @param {'gemini' | 'openai' | 'local'} providerName 
   * @param {string} apiKey 
   * @param {string} promptText 
   * @returns {Promise<object>}
   */
  async translate(providerName, apiKey, promptText) {
    const provider = this.providers[providerName] || this.providers['local'];
    return await provider.translatePrompt(apiKey, promptText);
  }
}

export const aiManager = new AIManager();
export default aiManager;
