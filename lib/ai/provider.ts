import "server-only";

/**
 * Shared LLM provider resolution for the AI features (sports roadmap +
 * job-search chat). Free, hosted, OpenAI-compatible by default (NVIDIA NIM);
 * Groq/Gemini/Ollama pluggable via env. Keys stay server-side.
 *
 *   SPORTS_AI_PROVIDER = nvidia | groq | gemini | ollama   (default nvidia)
 *   SPORTS_AI_API_KEY  = generic key override; else provider-specific
 *                        (NVIDIA_KEY / GROQ_API_KEY / GEMINI_API_KEY)
 *   SPORTS_AI_MODEL / SPORTS_AI_BASE_URL = optional overrides
 */

export interface AiProvider {
  kind: "openai" | "gemini" | "ollama";
  url: string;
  model: string;
  key: string | undefined;
}

/** First non-empty value — treats "" / whitespace as unset, unlike `??`. */
export function firstSet(...vals: (string | undefined)[]): string | undefined {
  for (const v of vals) {
    const t = v?.trim();
    if (t) return t;
  }
  return undefined;
}

export function resolveAiProvider(): AiProvider {
  const provider = firstSet(process.env.SPORTS_AI_PROVIDER)?.toLowerCase() ?? "nvidia";
  const override = process.env.SPORTS_AI_API_KEY;
  const model = process.env.SPORTS_AI_MODEL;
  const base = process.env.SPORTS_AI_BASE_URL;

  switch (provider) {
    case "groq":
      return {
        kind: "openai",
        url: firstSet(base) ?? "https://api.groq.com/openai/v1/chat/completions",
        model: firstSet(model) ?? "llama-3.3-70b-versatile",
        key: firstSet(override, process.env.GROQ_API_KEY),
      };
    case "gemini": {
      const m = firstSet(model) ?? "gemini-2.0-flash";
      return {
        kind: "gemini",
        url:
          firstSet(base) ??
          `https://generativelanguage.googleapis.com/v1beta/models/${m}:generateContent`,
        model: m,
        key: firstSet(override, process.env.GEMINI_API_KEY),
      };
    }
    case "ollama":
      return {
        kind: "ollama",
        url: firstSet(base) ?? "http://localhost:11434/api/chat",
        model: firstSet(model) ?? "llama3.1",
        key: "local",
      };
    case "nvidia":
    default:
      return {
        kind: "openai",
        url: firstSet(base) ?? "https://integrate.api.nvidia.com/v1/chat/completions",
        model: firstSet(model) ?? "meta/llama-3.3-70b-instruct",
        key: firstSet(override, process.env.NVIDIA_KEY),
      };
  }
}
