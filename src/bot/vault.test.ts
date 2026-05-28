import fs from "fs";
import os from "os";
import path from "path";
import { beforeEach, describe, expect, it, vi } from "vitest";

const callAI = vi.fn();

vi.mock("./ai", () => ({ callAI }));

async function loadVault(tempDir: string) {
  vi.resetModules();
  process.env.VAULT_PATH = tempDir;
  return import("./vault");
}

describe("vault user notes", () => {
  beforeEach(() => {
    callAI.mockReset();
  });

  it("stores user notes by Discord user id and keeps displayName visible", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "toro-vault-"));
    const vault = await loadVault(tempDir);
    vault.initVault();

    vault.appendToUserNote({ discordUserId: "user_123", displayName: "yeonnnn" }, "[2026-05-28] [[캡스톤]] 전시 준비 중");

    const idNotePath = path.join(tempDir, "TORO", "users", "user_123.md");
    expect(fs.existsSync(idNotePath)).toBe(true);
    const note = fs.readFileSync(idNotePath, "utf-8");
    expect(note).toContain('discordUserId: "user_123"');
    expect(note).toContain('displayName: "yeonnnn"');
    expect(note).toContain("# yeonnnn");
  });

  it("updates displayName in the existing id-based note when the name changes", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "toro-vault-"));
    const vault = await loadVault(tempDir);
    vault.initVault();

    vault.appendToUserNote({ discordUserId: "user_123", displayName: "oldName" }, "[2026-05-28] [[NAS]] 사용 중");
    const updated = vault.readUserNote({ discordUserId: "user_123", displayName: "newName" });

    expect(updated).toContain('displayName: "newName"');
    expect(updated).toContain('name: "newName"');
    expect(updated).toContain("# newName");
    expect(updated).toContain("[[NAS]] 사용 중");
  });

  it("migrates a legacy displayName-based note into a user id note", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "toro-vault-"));
    const usersDir = path.join(tempDir, "TORO", "users");
    fs.mkdirSync(usersDir, { recursive: true });
    fs.writeFileSync(path.join(usersDir, "yeonnnn.md"), "---\nname: yeonnnn\nupdated: 2026-05-28\ntags: [toro/user]\n---\n\n# yeonnnn\n\n## 기록\n- [2026-05-28] [[캡스톤]] 최종전시일임\n");

    const vault = await loadVault(tempDir);
    const note = vault.readUserNote({ discordUserId: "user_123", displayName: "yeonnnn" });

    expect(fs.existsSync(path.join(usersDir, "user_123.md"))).toBe(true);
    expect(note).toContain('discordUserId: "user_123"');
    expect(note).toContain("[[캡스톤]] 최종전시일임");
  });

  it("extracts only valid fact lines for the target user", async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "toro-vault-"));
    const vault = await loadVault(tempDir);
    vault.initVault();
    callAI.mockResolvedValue([
      "[2026-05-28] [[캡스톤]] 최종전시일임",
      "[2026-05-28] 보벳띠: 해산물을 싫어함",
      "참고: 보벳띠는 다른 사람임",
    ].join("\n"));

    const facts = await vault.extractAndSave({ discordUserId: "user_123", displayName: "yeonnnn" }, [
      { role: "user", discordUserId: "other", displayName: "보벳띠", content: "보벳띠: 해산물 싫어" },
      { role: "user", discordUserId: "user_123", displayName: "yeonnnn", content: "yeonnnn: 내일 캡스톤 최종전시야" },
    ]);

    expect(facts).toEqual(["[2026-05-28] [[캡스톤]] 최종전시일임"]);
    expect(callAI.mock.calls[0][0]).toEqual([
      { role: "user", discordUserId: "user_123", displayName: "yeonnnn", content: "yeonnnn: 내일 캡스톤 최종전시야" },
    ]);
  });
});
