import { describe, it, expect, beforeEach, vi } from "vitest";
import { state, addLog, addEvent, addError, trackUser, trackKeywords, getTopKeywords, getUserStatsRanked } from "./state";

// Mock log-store to avoid filesystem writes during tests
vi.mock("./log-store", () => ({
  appendLog: vi.fn(),
  migrateLogs: vi.fn(),
}));

import { appendLog } from "./log-store";

describe("state", () => {
  beforeEach(() => {
    state.events = [];
    state.errors = [];
    state.userStats = {};
    state.keywords = {};
    vi.clearAllMocks();
  });

  describe("addLog", () => {
    it("should call appendLog with timestamp", () => {
      addLog({
        guild: "test-guild",
        channel: "general",
        author: "user1",
        content: "hello",
        botReplied: false,
        triggerReason: null,
        botReply: null,
        responseTime: null,
        ragHits: 0,
        error: null,
        model: null,
      });

      expect(appendLog).toHaveBeenCalledTimes(1);
      const call = (appendLog as any).mock.calls[0][0];
      expect(call.channel).toBe("general");
      expect(call.timestamp).toBeTypeOf("number");
    });
  });

  describe("addEvent", () => {
    it("should add an event", () => {
      addEvent("bot_start", "test");
      expect(state.events).toHaveLength(1);
      expect(state.events[0].type).toBe("bot_start");
    });
  });

  describe("addError", () => {
    it("should add an error", () => {
      addError("rate_limit", "429 error", "channel: test");
      expect(state.errors).toHaveLength(1);
      expect(state.errors[0].type).toBe("rate_limit");
    });
  });

  describe("trackUser", () => {
    it("should create new user stat", () => {
      trackUser("123", "testUser", false);
      expect(state.userStats["123"].displayName).toBe("testUser");
      expect(state.userStats["123"].messages).toBe(1);
      expect(state.userStats["123"].gotReplies).toBe(0);
    });

    it("should increment on bot reply", () => {
      trackUser("123", "testUser", true);
      trackUser("123", "testUser", true);
      trackUser("123", "testUser", false);
      expect(state.userStats["123"].messages).toBe(3);
      expect(state.userStats["123"].gotReplies).toBe(2);
    });
  });

  describe("trackKeywords", () => {
    it("should count words", () => {
      trackKeywords("치킨 먹고 싶다 치킨");
      expect(state.keywords["치킨"]).toBe(2);
      expect(state.keywords["먹고"]).toBe(1);
    });

    it("should filter stop words", () => {
      trackKeywords("나 진짜 그래");
      expect(state.keywords["진짜"]).toBeUndefined();
      expect(state.keywords["그래"]).toBeUndefined();
    });

    it("should filter numeric strings", () => {
      trackKeywords("1483647694038630550 hello");
      expect(state.keywords["1483647694038630550"]).toBeUndefined();
    });

    it("should filter discord mentions", () => {
      trackKeywords("<@1483647694038630550> 안녕");
      expect(state.keywords["1483647694038630550"]).toBeUndefined();
    });
  });

  describe("getTopKeywords", () => {
    it("should return sorted keywords", () => {
      state.keywords = { "치킨": 10, "피자": 5, "햄버거": 8 };
      const top = getTopKeywords(2);
      expect(top).toHaveLength(2);
      expect(top[0].word).toBe("치킨");
      expect(top[1].word).toBe("햄버거");
    });
  });

  describe("getUserStatsRanked", () => {
    it("should return sorted by messages", () => {
      state.userStats = {
        "a": { displayName: "A", messages: 5, gotReplies: 1 },
        "b": { displayName: "B", messages: 10, gotReplies: 3 },
      };
      const ranked = getUserStatsRanked();
      expect(ranked[0].displayName).toBe("B");
    });
  });
});
