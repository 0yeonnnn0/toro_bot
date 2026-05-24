export const DEFAULT_AI_PROVIDER = "openai";
export const DEFAULT_CODEX_MODEL = "gpt-5.1-codex";
export const DEFAULT_GEMINI_FALLBACK_PROVIDER = "google";
export const DEFAULT_GEMINI_FALLBACK_MODEL = "gemini-3.1-flash-lite-preview";

const LEGACY_GOOGLE_DEFAULT_MODELS = new Set([
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
]);

export function defaultModelForProvider(provider: string): string {
  switch (provider) {
    case "openai":
      return process.env.OPENAI_MODEL || DEFAULT_CODEX_MODEL;
    case "anthropic":
      return process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
    case "google":
      return process.env.GOOGLE_MODEL || DEFAULT_GEMINI_FALLBACK_MODEL;
    default:
      return process.env.OPENAI_MODEL || DEFAULT_CODEX_MODEL;
  }
}

export function shouldMigrateLegacyGeminiDefault(provider?: string, model?: string): boolean {
  return provider === "google" && (!model || LEGACY_GOOGLE_DEFAULT_MODELS.has(model));
}

export function fallbackModel(): string {
  return process.env.GOOGLE_FALLBACK_MODEL || process.env.GOOGLE_MODEL || DEFAULT_GEMINI_FALLBACK_MODEL;
}
