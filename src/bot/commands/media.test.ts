import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../draw", () => ({
  generateImage: vi.fn(),
}));

import { MessageFlags } from "discord.js";
import { generateImage } from "../draw";
import { formatSayReplyContent, handleDraw } from "./media";

function fakeDrawInteraction(prompt = "고양이") {
  return {
    options: {
      getString: vi.fn((name: string, required?: boolean) => {
        if (name === "prompt" && required) return prompt;
        if (name === "quality") return "flash";
        return null;
      }),
    },
    deferReply: vi.fn(),
    editReply: vi.fn(),
    deleteReply: vi.fn().mockResolvedValue(undefined),
    channel: {
      isSendable: vi.fn(() => true),
      send: vi.fn().mockResolvedValue({ id: "message_1" }),
    },
  } as any;
}

describe("/draw command", () => {
  beforeEach(() => vi.clearAllMocks());

  it("hides the deferred interaction and sends the completed image as a fresh channel message", async () => {
    const attachment = { name: "toro-art.png" };
    vi.mocked(generateImage).mockResolvedValue({
      attachment: attachment as any,
      provider: "codex",
      usedModel: "flash",
    });
    const interaction = fakeDrawInteraction("우주 고양이");

    await handleDraw(interaction);

    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    expect(interaction.channel.send).toHaveBeenCalledWith({
      content: "**우주 고양이** (codex fast)",
      files: [attachment],
      allowedMentions: { parse: [] },
    });
    expect(interaction.deleteReply).toHaveBeenCalled();
    expect(interaction.editReply).not.toHaveBeenCalled();
  });
});

describe("/say command", () => {
  it("includes the original message with the AI reply", () => {
    const content = formatSayReplyContent("오늘 어때?", "좋다냥");

    expect(content).toContain("**원본 메시지**\n오늘 어때?");
    expect(content).toContain("**토로 답변**\n좋다냥");
  });

  it("keeps Discord reply content under the 2000 character limit", () => {
    const content = formatSayReplyContent("a".repeat(1200), "b".repeat(1200));

    expect(content.length).toBeLessThanOrEqual(2000);
    expect(content.endsWith("…")).toBe(true);
  });
});
