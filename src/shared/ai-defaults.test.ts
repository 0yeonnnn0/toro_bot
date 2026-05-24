import { describe, it, expect } from "vitest";
import { DEFAULT_AI_PROVIDER, DEFAULT_CODEX_MODEL, DEFAULT_GEMINI_FALLBACK_MODEL, defaultModelForProvider, shouldMigrateLegacyGeminiDefault } from "./ai-defaults";

describe("ai-defaults", () => {
  it("uses Codex as the default chat provider/model", () => {
    expect(DEFAULT_AI_PROVIDER).toBe("openai");
    expect(defaultModelForProvider("openai")).toBe(process.env.OPENAI_MODEL || DEFAULT_CODEX_MODEL);
  });

  it("uses Gemini as the fallback model", () => {
    expect(defaultModelForProvider("google")).toBe(process.env.GOOGLE_MODEL || DEFAULT_GEMINI_FALLBACK_MODEL);
  });

  it("migrates legacy Gemini defaults to the new Codex default", () => {
    expect(shouldMigrateLegacyGeminiDefault("google", "gemini-3.1-flash-lite-preview")).toBe(true);
    expect(shouldMigrateLegacyGeminiDefault("google", "gemini-2.5-flash-lite")).toBe(true);
    expect(shouldMigrateLegacyGeminiDefault("google", "custom-gemini-model")).toBe(false);
    expect(shouldMigrateLegacyGeminiDefault("openai", "gpt-5.1-codex")).toBe(false);
  });
});
