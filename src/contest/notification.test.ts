import { describe, expect, it, vi } from "vitest";
import { buildContestMessage, parseContestCustomId, runContestNotificationCycle } from "./notification";
import type { ContestCandidate, ContestCycleStore } from "./types";

const contest: ContestCandidate = {
  canonicalKey: "contest-key",
  title: "2026 AI 데이터 분석 경진대회",
  host: "○○기관",
  category: "AI/데이터",
  applyEnd: "2026-11-30",
  sourceUrl: "https://linkareer.com/activity/1",
  sourceIssueUrl: "https://github.com/example/issues/1",
  summary: "공공데이터를 활용하는 경진대회",
  track: "it",
};

function store(overrides: Partial<ContestCycleStore> = {}): ContestCycleStore {
  return {
    upsertMany: vi.fn().mockResolvedValue(undefined),
    expireBefore: vi.fn().mockResolvedValue([]),
    listNotificationCandidates: vi.fn().mockResolvedValue([]),
    reserveDailySlots: vi.fn().mockImplementation(async (_userId, _today, _max, requested) => requested),
    claimNotification: vi.fn().mockResolvedValue("claim_1"),
    completeNotification: vi.fn().mockResolvedValue(undefined),
    releaseNotificationClaim: vi.fn().mockResolvedValue(undefined),
    markNotificationDeleted: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("contest notifications", () => {
  it("builds persistent custom-id buttons and a link button", () => {
    const message = buildContestMessage({ ...contest, id: "contest_1" });
    const components = message.components?.[0].toJSON() as { components: Array<{ custom_id?: string; url?: string }> };

    expect(components.components).toEqual(expect.arrayContaining([
      expect.objectContaining({ custom_id: "contest:interest:contest_1" }),
      expect.objectContaining({ custom_id: "contest:ignore:contest_1" }),
      expect.objectContaining({ url: contest.sourceUrl }),
    ]));
    expect(parseContestCustomId("contest:interest:contest_1")).toEqual({ action: "interest", contestId: "contest_1" });
    expect(parseContestCustomId("music_pause")).toBeNull();
  });

  it("cleans up before fetching, reserves the daily quota, and claims before sending", async () => {
    const contestStore = store({
      expireBefore: vi.fn().mockResolvedValue([{ id: "notification_1", targetId: "owner", channelId: "dm", messageId: "old" }]),
      listNotificationCandidates: vi.fn().mockResolvedValue([{ ...contest, id: "contest_1" }]),
    });
    const source = { fetchActiveContests: vi.fn().mockResolvedValue([contest]) };
    const messenger = {
      sendContest: vi.fn().mockResolvedValue({ channelId: "dm", messageId: "new" }),
      deleteMessage: vi.fn().mockResolvedValue(undefined),
    };

    const result = await runContestNotificationCycle({
      today: "2026-11-05",
      targetId: "owner",
      maxNotifications: 5,
      source,
      store: contestStore,
      messenger,
    });

    expect(messenger.deleteMessage).toHaveBeenCalledWith("owner", "dm", "old");
    expect(contestStore.markNotificationDeleted).toHaveBeenCalledWith("notification_1");
    expect(contestStore.upsertMany).toHaveBeenCalledWith([contest]);
    expect(contestStore.reserveDailySlots).toHaveBeenCalledWith("owner", "2026-11-05", 5, 1);
    expect(contestStore.claimNotification).toHaveBeenCalledWith("owner", "contest_1");
    expect(messenger.sendContest).toHaveBeenCalledWith("owner", expect.objectContaining({ id: "contest_1" }));
    expect(contestStore.completeNotification).toHaveBeenCalledWith("claim_1", "dm", "new");
    expect(result).toEqual({ discovered: 1, expired: 1, sent: 1, failures: 0, sourceFailed: false });
  });

  it("continues when one deletion or send fails", async () => {
    const first = { ...contest, id: "contest_1" };
    const second = { ...contest, id: "contest_2", canonicalKey: "two", sourceUrl: "https://linkareer.com/activity/2" };
    const contestStore = store({
      expireBefore: vi.fn().mockResolvedValue([
        { id: "expired_1", targetId: "owner", channelId: "dm", messageId: "missing" },
        { id: "expired_2", targetId: "owner", channelId: "dm", messageId: "exists" },
      ]),
      listNotificationCandidates: vi.fn().mockResolvedValue([first, second]),
      claimNotification: vi.fn().mockResolvedValueOnce("claim_1").mockResolvedValueOnce("claim_2"),
    });
    const messenger = {
      deleteMessage: vi.fn().mockRejectedValueOnce(new Error("temporary")).mockResolvedValueOnce(undefined),
      sendContest: vi.fn().mockRejectedValueOnce(new Error("dm closed")).mockResolvedValueOnce({ channelId: "dm", messageId: "new" }),
    };

    const result = await runContestNotificationCycle({
      today: "2026-11-05",
      targetId: "owner",
      maxNotifications: 5,
      source: { fetchActiveContests: vi.fn().mockRejectedValue(new Error("GitHub unavailable")) },
      store: contestStore,
      messenger,
    });

    expect(contestStore.markNotificationDeleted).toHaveBeenCalledWith("expired_2");
    expect(contestStore.releaseNotificationClaim).toHaveBeenCalledWith("claim_1");
    expect(contestStore.completeNotification).toHaveBeenCalledWith("claim_2", "dm", "new");
    expect(result).toEqual({ discovered: 0, expired: 1, sent: 1, failures: 2, sourceFailed: true });
  });

  it("keeps a claim when the DM was sent but completion recording fails", async () => {
    const contestStore = store({
      listNotificationCandidates: vi.fn().mockResolvedValue([{ ...contest, id: "contest_1" }]),
      completeNotification: vi.fn().mockRejectedValue(new Error("database unavailable")),
    });

    const result = await runContestNotificationCycle({
      today: "2026-11-05",
      targetId: "owner",
      maxNotifications: 5,
      source: { fetchActiveContests: vi.fn().mockResolvedValue([]) },
      store: contestStore,
      messenger: {
        deleteMessage: vi.fn(),
        sendContest: vi.fn().mockResolvedValue({ channelId: "dm", messageId: "sent" }),
      },
    });

    expect(contestStore.releaseNotificationClaim).not.toHaveBeenCalled();
    expect(result).toEqual({ discovered: 0, expired: 0, sent: 0, failures: 1, sourceFailed: false });
  });
});
