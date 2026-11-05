import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/client", () => ({
  prisma: {
    contest: {
      updateMany: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { prisma } from "../db/client";
import { contestStore } from "./store";

describe("contest store expiration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.contest.updateMany).mockResolvedValue({ count: 1 });
    vi.mocked(prisma.contest.findMany).mockResolvedValue([
      {
        id: "contest_1",
        notifications: [{ id: "notification_1", userId: "owner", channelId: "dm", messageId: "message_1" }],
      },
    ] as never);
  });

  it("reselects undeleted notifications even after the contest is already expired", async () => {
    await expect(contestStore.expireBefore("2026-11-07")).resolves.toEqual([
      { id: "notification_1", userId: "owner", channelId: "dm", messageId: "message_1" },
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
