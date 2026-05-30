// ─────────────────────────────────────────────────────────────────────────────
// Provider-agnostic AI client (OpenAI-compatible chat completions).
//
// Works with any provider that exposes the OpenAI `/chat/completions` shape —
// Groq (free tier), OpenAI, Together, OpenRouter, a self-hosted Ollama, etc.
// To switch providers you only change three env vars, no code:
//
//   AI_API_KEY   – your provider key
//   AI_BASE_URL  – e.g. https://api.groq.com/openai/v1  (default)
//   AI_MODEL     – e.g. llama-3.3-70b-versatile          (default)
//
// Get a FREE Groq key at: https://console.groq.com/keys
// ─────────────────────────────────────────────────────────────────────────────
import AppErrorHelper from "./AppErrorHelper.js";

const AI_BASE_URL = (process.env.AI_BASE_URL || "https://api.groq.com/openai/v1").replace(/\/$/, "");
const AI_MODEL = process.env.AI_MODEL || "llama-3.3-70b-versatile";
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 25000);

// Read the key lazily so the rest of the app boots even when it isn't set.
const getApiKey = () => process.env.AI_API_KEY;

/** True when an API key is configured — lets callers fail fast with a clear message. */
export const isAiConfigured = () => Boolean(getApiKey());

/**
 * Send a single-turn chat completion and return the assistant text.
 *
 * @param {object}  opts
 * @param {string}  opts.system       – system prompt (role/instructions)
 * @param {string}  opts.user         – user prompt (the content to act on)
 * @param {number} [opts.maxTokens=600]
 * @param {number} [opts.temperature=0.3]
 * @returns {Promise<{ text: string, model: string }>}
 */
export async function chatCompletion({ system, user, maxTokens = 600, temperature = 0.3 }) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new AppErrorHelper(
      "AI summaries are not configured. Set AI_API_KEY in your environment.",
      503,
    );
  }

  // Abort before the app's 30s request timeout so we return a clean 502 instead.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        temperature,
        max_tokens: maxTokens,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === "AbortError") {
      throw new AppErrorHelper("AI provider timed out", 504);
    }
    throw new AppErrorHelper(`AI provider request failed: ${err.message}`, 502);
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new AppErrorHelper(`AI provider error (${res.status}): ${detail.slice(0, 300)}`, 502);
  }

  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new AppErrorHelper("AI provider returned an empty response", 502);
  }

  return { text, model: data.model || AI_MODEL };
}
