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
    {
      "indicator": "Candle",
      "property": "open" | "close" | "high" | "low" | "body" | "upperWick" | "lowerWick" | "upperWickRatio" | "lowerWickRatio" | "bodyRatio" | "isBearish" | "isBullish",
      "operator": ">" | "<" | ">=" | "<=" | "==",
      "value": number (e.g. 0.5 for 50%) or string property name (e.g. "open", "close", "prevOpen", "prevClose", "prevHigh", "prevLow")
    },
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
- Candle: checks specific properties or geometries of the current candlestick.
  - "open", "close", "high", "low" (absolute price values of the candle)
  - "body" (absolute size of the candle body: |close - open|)
  - "upperWick" (absolute size of upper wick: high - max(open, close))
  - "lowerWick" (absolute size of lower wick: min(open, close) - low)
  - "upperWickRatio" (upper wick size divided by total range high-low, e.g. 0.5 for 50%)
  - "lowerWickRatio" (lower wick size divided by total range high-low)
  - "bodyRatio" (body size divided by total range high-low)
  - "isBearish" (1 if close < open, 0 otherwise)
  - "isBullish" (1 if close > open, 0 otherwise)

Examples for Candle indicator:
- "close is less than open":
  {"indicator": "Candle", "property": "close", "operator": "<", "value": "open"}
- "upper wick is greater than 50%":
  {"indicator": "Candle", "property": "upperWickRatio", "operator": ">", "value": 0.5}
- "body is larger than upper wick":
  {"indicator": "Candle", "property": "body", "operator": ">", "value": "upperWick"}
- "close is greater than previous close":
  {"indicator": "Candle", "property": "close", "operator": ">", "value": "prevClose"}

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

    const model = 'gemini-2.5-flash';
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

  async summarizeNotification(apiKey, summary) {
    if (!apiKey) {
      throw new Error('Gemini API Key is not configured.');
    }

    const model = 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const instruction = `
You are an expert trading assistant. You will receive a JSON technical summary of a triggered trading alert, containing the triggered rule, the symbol, the price, and a compact context window of indicators (RSI, EMA, SMA, MACD) and recent ticks.
Generate a highly professional, concise natural language alert notification message of less than 25 words. Summarize why the alert triggered, mention the price, and give a brief observation of the trend based on the context indicators. Output ONLY the raw text message. Do not include markdown code block syntax.
`;

    const payload = {
      contents: [
        {
          parts: [
            { text: instruction },
            { text: `Summarize this alert JSON: ${JSON.stringify(summary)}` }
          ]
        }
      ]
    };

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`Gemini API Error: ${response.status}`);
    }

    const data = await response.json();
    if (!data.candidates || data.candidates.length === 0) {
      throw new Error('No candidate response from Gemini.');
    }

    return data.candidates[0].content.parts[0].text.trim();
  }
}

export default GeminiAI;
