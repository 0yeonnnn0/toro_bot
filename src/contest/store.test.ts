import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/client", () => ({
  prisma: {
    contest: {
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
    contestSubscription: {
      upsert: vi.fn(),
      updateMany: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "../db/client";
import {
  contestStore,
  disableContestSubscription,
  listActiveContestSubscriptions,
  upsertContestSubscription,
} from "./store";

describe("contest store expiration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.contest.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.contest.findMany).mockResolvedValue([
      {
        id: "contest_1",
        notifications: [{ id: "notification_1", targetId: "owner", channelId: "dm", messageId: "message_1" }],
      },
    ] as never);
  });

  it("reselects undeleted notifications even after the contest is already expired", async () => {
    await expect(contestStore.expireBefore("2026-11-07")).resolves.toEqual([
      { id: "notification_1", targetId: "owner", channelId: "dm", messageId: "message_1" },
    ]);

    expect(prisma.contest.updateMany).toHaveBeenCalledWith({
      where: { status: "ACTIVE", applyEnd: { lt: "2026-11-07" } },
      data: { status: "EXPIRED" },
    });
    expect(prisma.contest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { applyEnd: { lt: "2026-11-07" } },
    }));
  });
});

describe("contest channel subscriptions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("enables the current channel idempotently", async () => {
    const subscription = { channelId: "thread_1", guildId: "guild_1", createdByUserId: "owner", enabled: true };
    vi.mocked(prisma.contestSubscription.upsert).mockResolvedValue(subscription as never);

    await expect(upsertContestSubscription({
      channelId: "thread_1",
      guildId: "guild_1",
      createdByUserId: "owner",
    })).resolves.toEqual(subscription);

    expect(prisma.contestSubscription.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { channelId: "thread_1" },
      update: expect.objectContaining({ enabled: true }),
    }));
  });

  it("disables and lists only enabled subscriptions", async () => {
    vi.mocked(prisma.contestSubscription.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.contestSubscription.findMany).mockResolvedValue([
      { channelId: "thread_2", guildId: "guild_1", createdByUserId: "owner", enabled: true },
    ] as never);

    await expect(disableContestSubscription("thread_1")).resolves.toBe(true);
    await expect(listActiveContestSubscriptions()).resolves.toEqual([
      { channelId: "thread_2", guildId: "guild_1", createdByUserId: "owner", enabled: true },
    ]);
  });
});
