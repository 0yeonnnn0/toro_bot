import { describe, it, expect } from "vitest";
import { DEFAULT_AI_PROVIDER, DEFAULT_CODEX_MODEL, DEFAULT_GEMINI_FALLBACK_MODEL, defaultModelForProvider, shouldMigrateLegacyChatDefault } from "./ai-defaults";

describe("ai-defaults", () => {
  it("uses Codex CLI as the default chat provider/model", () => {
    expect(DEFAULT_AI_PROVIDER).toBe("codex");
    expect(defaultModelForProvider("codex")).toBe(process.env.CODEX_MODEL || DEFAULT_CODEX_MODEL);
  });

  it("keeps Gemini as the fallback model", () => {
    expect(defaultModelForProvider("google")).toBe(process.env.GOOGLE_MODEL || DEFAULT_GEMINI_FALLBACK_MODEL);
  });

  it("migrates legacy Gemini/OpenAI defaults to the new Codex provider", () => {
    expect(shouldMigrateLegacyChatDefault("google", "gemini-3.1-flash-lite-preview")).toBe(true);
    expect(shouldMigrateLegacyChatDefault("google", "gpt-5.1-codex")).toBe(true);
    expect(shouldMigrateLegacyChatDefault("google", "custom-gemini-model")).toBe(false);
    expect(shouldMigrateLegacyChatDefault("openai", "gpt-5.1-codex")).toBe(true);
    expect(shouldMigrateLegacyChatDefault("openai", "gpt-4o")).toBe(false);
    expect(shouldMigrateLegacyChatDefault("codex", "codex-cli-default")).toBe(false);
  });
});
