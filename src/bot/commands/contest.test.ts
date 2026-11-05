import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../contest/store", () => ({
  disableContestSubscription: vi.fn(),
  getContestSubscription: vi.fn(),
  upsertContestSubscription: vi.fn(),
}));
vi.mock("../../contest/notifier", () => ({ runContestNotifierNow: vi.fn() }));

import { handleContestCommand } from "./contest";
import { runContestNotifierNow } from "../../contest/notifier";
import { disableContestSubscription, getContestSubscription, upsertContestSubscription } from "../../contest/store";

function command(action: "시작" | "중지" | "상태") {
  return {
    guildId: "guild_1",
    channelId: "thread_1",
    user: { id: "owner" },
    client: {},
    memberPermissions: { has: vi.fn().mockReturnValue(true) },
    options: { getSubcommand: vi.fn().mockReturnValue(action) },
    deferReply: vi.fn().mockResolvedValue(undefined),
    editReply: vi.fn().mockResolvedValue(undefined),
    reply: vi.fn().mockResolvedValue(undefined),
  };
}

describe("/공모전", () => {
  beforeEach(() => {
    process.env.OWNER_ID = "owner";
    vi.clearAllMocks();
  });

  it("subscribes the current thread and posts an immediate batch", async () => {
    const interaction = command("시작");
    vi.mocked(upsertContestSubscription).mockResolvedValue({ channelId: "thread_1", enabled: true } as never);
    vi.mocked(runContestNotifierNow).mockResolvedValue({ sent: 3 } as never);

    await handleContestCommand(interaction as never);

    expect(upsertContestSubscription).toHaveBeenCalledWith({
      channelId: "thread_1",
      guildId: "guild_1",
      createdByUserId: "owner",
    });
    expect(runContestNotifierNow).toHaveBeenCalledWith(interaction.client, "thread_1");
    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining("3개"));
  });

  it("stops notifications in the current thread", async () => {
    const interaction = command("중지");
    vi.mocked(disableContestSubscription).mockResolvedValue(true);

    await handleContestCommand(interaction as never);

    expect(disableContestSubscription).toHaveBeenCalledWith("thread_1");
    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("중지") }));
  });

  it("reports subscription status", async () => {
    const interaction = command("상태");
    vi.mocked(getContestSubscription).mockResolvedValue({ enabled: true } as never);

    await handleContestCommand(interaction as never);

    expect(interaction.reply).toHaveBeenCalledWith(expect.objectContaining({ content: expect.stringContaining("켜져") }));
  });
});
