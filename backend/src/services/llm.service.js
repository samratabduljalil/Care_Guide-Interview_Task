const { geminiKey, geminiModel, geminiBaseUrl } = require('../config/env');
const logger = require('../utils/logger');
const fallbackMessage = require('../utils/fallbackMessage');

const SYSTEM_PROMPT =
  'You are an API monitoring assistant for a healthcare company. ' +
  'Write ONE short, clear alert (max 2 sentences) for an operations team. ' +
  'State what happened using the numbers given, and suggest a likely cause. ' +
  'Do not use markdown or emojis.';

const MAX_ATTEMPTS = 3;          // 1 try + 2 retries
const TIMEOUT_MS = 50000;        // per attempt
const RETRY_STATUS = [429, 500, 502, 503, 504]; // temporary Gemini problems

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function callGemini(anomaly) {
  const userPrompt =
    `API: ${anomaly.api_name}\n` +
    `Issues: ${anomaly.issues.join(', ')}\n` +
    `Severity: ${anomaly.severity}\n` +
    `Metrics: ${JSON.stringify(anomaly.metrics)}`;

  const res = await fetch(`${geminiBaseUrl}/models/${geminiModel}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const err = new Error(`Gemini HTTP ${res.status}`);
    err.retryable = RETRY_STATUS.includes(res.status);
    throw err;
  }
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text || '').join('').trim();
  if (!text) throw new Error('Empty Gemini response');
  return text;
}

/**
 * Returns { message, ai_generated }. Never throws.
 * Retries temporary errors (503 overloaded, 429 rate limit, timeouts) with a short wait,
 * then falls back to a template so the alert is never lost.
 */
async function generateAlertMessage(anomaly) {
  if (!geminiKey) return { message: fallbackMessage(anomaly), ai_generated: false };

  const started = Date.now();
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const message = await callGemini(anomaly);
      logger.info(`Gemini ok for ${anomaly.api_name} (attempt ${attempt}, ${Date.now() - started} ms)`);
      return { message, ai_generated: true };
    } catch (err) {
      const retryable = err.retryable || err.name === 'TimeoutError' || err.name === 'AbortError';
      if (retryable && attempt < MAX_ATTEMPTS) {
        logger.warn(`Gemini attempt ${attempt} failed for ${anomaly.api_name} (${err.message}), retrying`);
        await sleep(800 * attempt + Math.random() * 400);
        continue;
      }
      logger.warn(`Gemini failed for ${anomaly.api_name}, using fallback: ${err.message}`);
      break;
    }
  }
  return { message: fallbackMessage(anomaly), ai_generated: false };
}

module.exports = { generateAlertMessage };
