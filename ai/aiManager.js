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
  async translate(providerName, apiKey, promptText, modelName) {
    const provider = this.providers[providerName] || this.providers['local'];
    return await provider.translatePrompt(apiKey, promptText, modelName);
  }

  /**
   * Summarizes a triggered alert message.
   * @param {'gemini' | 'openai' | 'local'} providerName 
   * @param {string} apiKey 
   * @param {object} summary 
   * @returns {Promise<string>}
   */
  async summarizeNotification(providerName, apiKey, summary, modelName) {
    const provider = this.providers[providerName] || this.providers['local'];
    if (providerName === 'local' || !apiKey) {
      return await this.providers['local'].summarizeNotification('', summary, modelName);
    }
    try {
      return await provider.summarizeNotification(apiKey, summary, modelName);
    } catch (err) {
      return await this.providers['local'].summarizeNotification('', summary, modelName);
    }
  }
}

export const aiManager = new AIManager();
export default aiManager;
