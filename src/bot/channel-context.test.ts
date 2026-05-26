import { describe, expect, it } from "vitest";
import { MENTION_CONTEXT_MIN_MESSAGES, MENTION_CONTEXT_WINDOW_MS, selectMentionContextMessages, type ContextCandidate } from "./channel-context";

function candidate(i: number, now: number, ageMinutes: number): ContextCandidate {
  return {
    id: `m${i}`,
    createdTimestamp: now - ageMinutes * 60_000,
    authorId: `u${i % 3}`,
    authorName: `User${i % 3}`,
    authorBot: false,
    content: `msg${i}`,
  };
}

describe("mention channel context selection", () => {
  it("uses the full two-hour window when it has at least 50 messages", () => {
    const now = Date.now();
    const messages = Array.from({ length: 80 }, (_, i) => candidate(i, now, i));

    const selected = selectMentionContextMessages(messages, now, "bot");

    expect(selected).toHaveLength(80);
    expect(selected[0].content).toContain("msg79");
    expect(selected[79].content).toContain("msg0");
  });

  it("expands to the latest 50 messages when the two-hour window is smaller", () => {
    const now = Date.now();
    const recent = Array.from({ length: 35 }, (_, i) => candidate(i, now, i));
    const older = Array.from({ length: 40 }, (_, i) => candidate(i + 35, now, 130 + i));

    const selected = selectMentionContextMessages([...recent, ...older], now, "bot");

    expect(selected).toHaveLength(MENTION_CONTEXT_MIN_MESSAGES);
    expect(selected[0].content).toContain("msg49");
    expect(selected[49].content).toContain("msg0");
  });

  it("skips other bots but keeps TORO assistant messages", () => {
    const now = Date.now();
    const selected = selectMentionContextMessages([
      { id: "1", createdTimestamp: now, authorId: "other-bot", authorName: "OtherBot", authorBot: true, content: "ignore" },
      { id: "2", createdTimestamp: now - 1, authorId: "bot", authorName: "TORO", authorBot: true, content: "assistant reply" },
      { id: "3", createdTimestamp: now - 2, authorId: "u1", authorName: "User", authorBot: false, content: "hello" },
    ], now, "bot");

    expect(selected).toEqual([
      { role: "user", content: "User: hello" },
      { role: "assistant", content: "TORO: assistant reply" },
    ]);
  });
});
