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

  async summarizeNotification(apiKey, summary) {
    if (!apiKey) {
      throw new Error('OpenAI API Key is missing.');
    }

    const url = 'https://api.openai.com/v1/chat/completions';
    
    const instruction = `
You are an expert trading assistant. You will receive a JSON technical summary of a triggered trading alert, containing the triggered rule, the symbol, the price, and a compact context window of indicators (RSI, EMA, SMA, MACD) and recent ticks.
Generate a highly professional, concise natural language alert notification message of less than 25 words. Summarize why the alert triggered, mention the price, and give a brief observation of the trend based on the context indicators. Output ONLY the raw text message. Do not include markdown code block syntax.
`;

    const payload = {
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: instruction },
        { role: 'user', content: `Summarize this alert JSON: ${JSON.stringify(summary)}` }
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
      throw new Error(`OpenAI API Error: ${response.status}`);
    }

    const data = await response.json();
    if (!data.choices || data.choices.length === 0) {
      throw new Error('No completion choices from OpenAI.');
    }

    return data.choices[0].message.content.trim();
  }
}

export default OpenAIClass;
