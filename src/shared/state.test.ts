import { beforeEach, describe, expect, it, vi } from "vitest";
import { state, addLog, addEvent, addError } from "./state";

vi.mock("./log-store", () => ({
  appendLog: vi.fn(),
  migrateLogs: vi.fn(),
}));

import { appendLog } from "./log-store";

describe("state", () => {
  beforeEach(() => {
    state.events = [];
    state.errors = [];
    vi.clearAllMocks();
  });

  it("keeps only aggregate stats instead of user profiles or keywords", () => {
    expect(state).not.toHaveProperty("userStats");
    expect(state).not.toHaveProperty("keywords");
  });

  it("writes privacy-safe operational logs", () => {
    addLog({
      guild: "test-guild",
      channel: "general",
      author: "[discord user]",
      content: "[ephemeral mention]",
      botReplied: true,
      triggerReason: "mention",
      botReply: null,
      responseTime: 100,
      ragHits: 0,
      error: null,
      model: "test-model",
    });

    expect(appendLog).toHaveBeenCalledTimes(1);
    const call = vi.mocked(appendLog).mock.calls[0][0];
    expect(call.author).toBe("[discord user]");
    expect(call.content).toBe("[ephemeral mention]");
    expect(call.botReply).toBeNull();
  });

  it("records bounded operational events", () => {
    addEvent("bot_start", "test");
    expect(state.events).toHaveLength(1);
    expect(state.events[0].type).toBe("bot_start");
  });

  it("records operational errors", () => {
    addError("rate_limit", "429 error", "channel: test");
    expect(state.errors).toHaveLength(1);
    expect(state.errors[0].type).toBe("rate_limit");
  });
});
