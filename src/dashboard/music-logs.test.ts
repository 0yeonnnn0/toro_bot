import { describe, expect, it } from "vitest";
import { sanitizeMusicLogEntry } from "./music-logs";

describe("music log privacy", () => {
  it("drops requester identity from persisted and public history", () => {
    const sanitized = sanitizeMusicLogEntry({
      id: "music_1",
      title: "Track",
      artist: null,
      url: "https://youtube.com/watch?v=abc",
      duration: "3:00",
      thumbnail: "",
      requestedBy: "private-display-name",
      timestamp: 1,
    });

    expect(sanitized).not.toHaveProperty("requestedBy");
    expect(sanitized.title).toBe("Track");
  });
});
