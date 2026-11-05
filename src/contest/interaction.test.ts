import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./store", () => ({
  hasContestNotification: vi.fn(),
  listInterestedUserIds: vi.fn(),
  setContestPreference: vi.fn(),
}));

import { handleContestButton } from "./interaction";
import { hasContestNotification, listInterestedUserIds, setContestPreference } from "./store";

function interaction(customId: string, userId = "member_1") {
  return {
    customId,
    channelId: "thread_1",
    guildId: "guild_1",
    user: { id: userId },
    deferUpdate: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
    followUp: vi.fn().mockResolvedValue(undefined),
    message: {
      id: "message_1",
      delete: vi.fn().mockResolvedValue(undefined),
      edit: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe("contest button interaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(hasContestNotification).mockResolvedValue(true);
    vi.mocked(listInterestedUserIds).mockResolvedValue(["member_1"]);
  });

  it("stores each member's interest and updates the shared message", async () => {
    const input = interaction("contest:interest:contest_1");

    await expect(handleContestButton(input as never)).resolves.toBe(true);
    expect(hasContestNotification).toHaveBeenCalledWith("thread_1", "contest_1", "message_1");
    expect(setContestPreference).toHaveBeenCalledWith("thread_1", "member_1", "contest_1", "INTERESTED");
    expect(listInterestedUserIds).toHaveBeenCalledWith("thread_1", "contest_1");
    expect(input.message.edit).toHaveBeenCalledWith(expect.objectContaining({
      content: expect.stringContaining("<@member_1>"),
      allowedMentions: { parse: [] },
    }));
  });

  it("stores ignore per member without deleting the shared message", async () => {
    vi.mocked(listInterestedUserIds).mockResolvedValue([]);
    const input = interaction("contest:ignore:contest_1", "member_2");

    await handleContestButton(input as never);

    expect(setContestPreference).toHaveBeenCalledWith("thread_1", "member_2", "contest_1", "IGNORED");
    expect(input.message.delete).not.toHaveBeenCalled();
    expect(input.message.edit).toHaveBeenCalledWith(expect.objectContaining({ content: "관심: 아직 없음" }));
  });

  it("rejects forged or stale channel buttons", async () => {
    vi.mocked(hasContestNotification).mockResolvedValue(false);
    const input = interaction("contest:interest:contest_1");

    await handleContestButton(input as never);

    expect(input.deferUpdate).toHaveBeenCalled();
    expect(input.followUp).toHaveBeenCalled();
    expect(setContestPreference).not.toHaveBeenCalled();
  });

  it("does not consume unrelated buttons", async () => {
    await expect(handleContestButton(interaction("music_pause") as never)).resolves.toBe(false);
  });
});
