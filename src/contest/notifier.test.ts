import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./store", () => ({
  contestStore: {
    expireBefore: vi.fn(),
    markNotificationDeleted: vi.fn(),
  },
  getContestSubscription: vi.fn(),
  listActiveContestSubscriptions: vi.fn(),
}));

import { runContestNotifierPass } from "./notifier";
import { contestStore, listActiveContestSubscriptions } from "./store";

describe("contest notifier pass", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(listActiveContestSubscriptions).mockResolvedValue([]);
  });

  it("deletes expired posts even when no channel is currently subscribed", async () => {
    vi.mocked(contestStore.expireBefore).mockResolvedValue([
      { id: "notification_1", targetId: "thread_1", channelId: "thread_1", messageId: "message_1" },
    ]);
    const deleteMessage = vi.fn().mockResolvedValue(undefined);
    const fetchMessage = vi.fn().mockResolvedValue({ delete: deleteMessage });
    const client = {
      channels: {
        fetch: vi.fn().mockResolvedValue({
          isTextBased: () => true,
          messages: { fetch: fetchMessage },
        }),
      },
    };

    await runContestNotifierPass(client as never);

    expect(deleteMessage).toHaveBeenCalled();
    expect(contestStore.markNotificationDeleted).toHaveBeenCalledWith("notification_1");
  });
});