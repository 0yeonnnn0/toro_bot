import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./store", () => ({ hasContestNotification: vi.fn(), setContestPreference: vi.fn() }));

import { handleContestButton } from "./interaction";
import { hasContestNotification, setContestPreference } from "./store";

function interaction(customId: string, userId = "owner") {
  return {
    customId,
    guildId: null,
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
    process.env.OWNER_ID = "owner";
    vi.clearAllMocks();
    vi.mocked(hasContestNotification).mockResolvedValue(true);
  });

  it("stores interest through the global custom-id handler", async () => {
    const input = interaction("contest:interest:contest_1");

    await expect(handleContestButton(input as never)).resolves.toBe(true);
    expect(input.deferUpdate).toHaveBeenCalled();
    expect(setContestPreference).toHaveBeenCalledWith("owner", "contest_1", "INTERESTED");
  });

  it("stores ignore and removes the DM", async () => {
    const input = interaction("contest:ignore:contest_1");

    await handleContestButton(input as never);
    expect(setContestPreference).toHaveBeenCalledWith("owner", "contest_1", "IGNORED");
    expect(input.message.delete).toHaveBeenCalled();
  });

  it("rejects forged or stale contest buttons", async () => {
    vi.mocked(hasContestNotification).mockResolvedValue(false);
    const input = interaction("contest:interest:contest_1");

    await handleContestButton(input as never);

    expect(input.reply).toHaveBeenCalled();
    expect(setContestPreference).not.toHaveBeenCalled();
  });

  it("does not consume unrelated buttons", async () => {
    await expect(handleContestButton(interaction("music_pause") as never)).resolves.toBe(false);
  });
});
