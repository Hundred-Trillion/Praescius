/**
 * OpenAI translation adapter.
 */

import BaseAI from './baseAI.js';

const SYSTEM_INSTRUCTION = `
You are a trading rule translator. Your job is to convert natural language trade notifications/rules into structured JSON.
You must output ONLY valid JSON matching this schema:

{
  "name": "User-friendly name of the rule",
  "operator": "AND" | "OR" | "NOT",
  "conditions": [
    {
      "indicator": "Price" | "RSI" | "SMA" | "EMA",
      "period": number (optional),
      "operator": ">" | "<" | ">=" | "<=" | "==" | "crossover_above" | "crossover_below",
      "value": number
    },
    ... or ...
    {
      "pattern": "Three Bullish Candles" | "Three Bearish Candles" | "Bullish Engulfing" | "Bearish Engulfing" | "Doji" | "Hammer"
    }
  ]
}

Supported Indicators: Price, RSI, SMA, EMA.
Supported Operators: ">", "<", ">=", "<=", "==", "crossover_above", "crossover_below".
Supported Patterns: "Three Bullish Candles", "Three Bearish Candles", "Bullish Engulfing", "Bearish Engulfing", "Doji", "Hammer".
Logical Operators: "AND", "OR", "NOT".
`;

export class OpenAIClass extends BaseAI {
  constructor() {
    super('openai');
  }

  async translatePrompt(apiKey, promptText) {
    if (!apiKey) {
      throw new Error('OpenAI API Key is missing. Configure it in settings.');
    }

    const url = 'https://api.openai.com/v1/chat/completions';
    
    const payload = {
      model: 'gpt-4o-mini',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_INSTRUCTION },
        { role: 'user', content: `Translate this user prompt: "${promptText}"` }
      ]
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`OpenAI API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    if (!data.choices || data.choices.length === 0) {
      throw new Error('No completion choices from OpenAI.');
    }

    const content = data.choices[0].message.content;
    return JSON.parse(content.trim());
  }
}

export default OpenAIClass;
