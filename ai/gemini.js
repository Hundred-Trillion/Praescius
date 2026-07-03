/**
 * Gemini translation adapter.
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
      "period": number (optional, e.g. 14 for RSI/SMA),
      "operator": ">" | "<" | ">=" | "<=" | "==" | "crossover_above" | "crossover_below",
      "value": number
    },
    ... or ...
    {
      "pattern": "Three Bullish Candles" | "Three Bearish Candles" | "Bullish Engulfing" | "Bearish Engulfing" | "Doji" | "Hammer"
    }
  ]
}

Supported Indicators:
- Price: checks the latest close price.
- RSI: checks Relative Strength Index. Can accept a "period" (default 14).
- SMA: checks Simple Moving Average. Requires a "period".
- EMA: checks Exponential Moving Average. Requires a "period".

Supported Operators for indicators:
- ">", "<", ">=", "<=", "=="
- "crossover_above", "crossover_below"

Supported Patterns:
- "Three Bullish Candles"
- "Three Bearish Candles"
- "Bullish Engulfing"
- "Bearish Engulfing"
- "Doji"
- "Hammer"

Logical Operators:
- "AND" (default)
- "OR"
- "NOT"

Always respond with ONLY the JSON object. Do not include markdown code block syntax.
`;

export class GeminiAI extends BaseAI {
  constructor() {
    super('gemini');
  }

  async translatePrompt(apiKey, promptText) {
    if (!apiKey) {
      throw new Error('Gemini API Key is not configured. Configure it in settings.');
    }

    const model = 'gemini-1.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const payload = {
      contents: [
        {
          parts: [
            { text: SYSTEM_INSTRUCTION },
            { text: `Translate this user prompt: "${promptText}"` }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: 'application/json'
      }
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Gemini API Error (${response.status}): ${errText}`);
    }

    const data = await response.json();
    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('No candidate response from Gemini.');
    }

    const textResult = data.candidates[0].content.parts[0].text;
    return JSON.parse(textResult.trim());
  }
}

export default GeminiAI;
