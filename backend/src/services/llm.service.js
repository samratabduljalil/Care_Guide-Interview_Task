const { geminiKey, geminiModel, geminiBaseUrl } = require('../config/env');
const logger = require('../utils/logger');
const fallbackMessage = require('../utils/fallbackMessage');

const SYSTEM_PROMPT =
  'You are an API monitoring assistant for a healthcare company. ' +
  'Write ONE short, clear alert (max 2 sentences) for an operations team. ' +
  'State what happened using the numbers given, and suggest a likely cause. ' +
  'Do not use markdown or emojis.';

/**
 * Returns { message, ai_generated }. Never throws: falls back to a template
 * if the key is missing or the Gemini call fails.
 */
async function generateAlertMessage(anomaly) {
  if (!geminiKey) {
    return { message: fallbackMessage(anomaly), ai_generated: false };
  }

  const userPrompt =
    `API: ${anomaly.api_name}\n` +
    `Issues: ${anomaly.issues.join(', ')}\n` +
    `Severity: ${anomaly.severity}\n` +
    `Metrics: ${JSON.stringify(anomaly.metrics)}`;

  try {
    const res = await fetch(`${geminiBaseUrl}/models/${geminiModel}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
      }),
      signal: AbortSignal.timeout(200000),
    });

    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text || '')
      .join('')
      .trim();
    if (!text) throw new Error('Empty Gemini response');

    return { message: text, ai_generated: true };
  } catch (err) {
    logger.warn(`Gemini failed for ${anomaly.api_name}, using fallback: ${err.message}`);
    return { message: fallbackMessage(anomaly), ai_generated: false };
  }
}

module.exports = { generateAlertMessage };
