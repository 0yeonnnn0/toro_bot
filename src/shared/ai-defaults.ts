export const DEFAULT_AI_PROVIDER = "codex";
export const DEFAULT_CODEX_MODEL = "codex-cli-default";
export const DEFAULT_GEMINI_FALLBACK_PROVIDER = "google";
export const DEFAULT_GEMINI_FALLBACK_MODEL = "gemini-3.1-flash-lite-preview";

const LEGACY_GOOGLE_DEFAULT_MODELS = new Set([
  "gemini-3.1-flash-lite-preview",
  "gemini-2.5-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.0-flash",
]);

const LEGACY_OPENAI_CODEX_MODELS = new Set([
  "gpt-5.1-codex",
  "gpt-5-codex",
]);

export function defaultModelForProvider(provider: string): string {
  switch (provider) {
    case "codex":
      return process.env.CODEX_MODEL || DEFAULT_CODEX_MODEL;
    case "openai":
      return process.env.OPENAI_MODEL || "gpt-4o";
    case "anthropic":
      return process.env.ANTHROPIC_MODEL || "claude-sonnet-4-20250514";
    case "google":
      return process.env.GOOGLE_MODEL || DEFAULT_GEMINI_FALLBACK_MODEL;
    default:
      return process.env.CODEX_MODEL || DEFAULT_CODEX_MODEL;
  }
}

export function shouldMigrateLegacyChatDefault(provider?: string, model?: string): boolean {
  if (model && LEGACY_OPENAI_CODEX_MODELS.has(model)) return true;
  if (provider === "google") return !model || LEGACY_GOOGLE_DEFAULT_MODELS.has(model);
  if (provider === "openai") return !model;
  return false;
}

export function fallbackModel(): string {
  return process.env.GOOGLE_FALLBACK_MODEL || process.env.GOOGLE_MODEL || DEFAULT_GEMINI_FALLBACK_MODEL;
}
