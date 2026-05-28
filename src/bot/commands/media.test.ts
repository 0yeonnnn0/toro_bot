import { describe, expect, it } from "vitest";
import { formatSayReplyContent } from "./media";

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
