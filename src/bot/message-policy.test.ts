import { describe, expect, it } from "vitest";
import { getMessagePolicy } from "./message-policy";

describe("ephemeral Discord message policy", () => {
  it("ignores ordinary chat until TORO is mentioned", () => {
    expect(getMessagePolicy({ isMentioned: false, isMuted: false })).toEqual({
      shouldReply: false,
      shouldCollect: false,
      shouldPersist: false,
    });
  });

  it("uses a mention only for the current response", () => {
    expect(getMessagePolicy({ isMentioned: true, isMuted: false })).toEqual({
      shouldReply: true,
      shouldCollect: false,
      shouldPersist: false,
    });
  });

  it("does nothing when the current channel is muted", () => {
    expect(getMessagePolicy({ isMentioned: true, isMuted: true })).toEqual({
      shouldReply: false,
      shouldCollect: false,
      shouldPersist: false,
    });
  });
});