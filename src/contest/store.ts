import { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import type {
  ContestCandidate,
  ContestCycleStore,
  ContestPreferenceStatus,
  ContestSubscriptionRecord,
  ExpiredNotification,
  StoredContest,
} from "./types";

function toStoredContest(row: {
  id: string;
  canonicalKey: string;
  title: string;
  host: string | null;
  category: string | null;
  applyEnd: string;
  sourceUrl: string;
  sourceIssueUrl: string;
  summary: string | null;
  track: string;
}): StoredContest {
  return { ...row, track: row.track === "non-it" ? "non-it" : "it" };
}

export const contestStore: ContestCycleStore = {
  async upsertMany(contests: ContestCandidate[]): Promise<void> {
    for (const contest of contests) {
      await prisma.contest.upsert({
        where: { canonicalKey: contest.canonicalKey },
        create: { ...contest, status: "ACTIVE" },
        update: {
          title: contest.title,
          host: contest.host,
          category: contest.category,
          applyEnd: contest.applyEnd,
          sourceUrl: contest.sourceUrl,
          sourceIssueUrl: contest.sourceIssueUrl,
          summary: contest.summary,
          track: contest.track,
          status: "ACTIVE",
        },
      });
    }
  },

  async expireBefore(today: string): Promise<ExpiredNotification[]> {
    await prisma.contest.updateMany({
      where: { status: "ACTIVE", applyEnd: { lt: today } },
      data: { status: "EXPIRED" },
    });
    const contests = await prisma.contest.findMany({
      where: { applyEnd: { lt: today } },
      select: {
        id: true,
        notifications: {
          where: { deletedAt: null, channelId: { not: null }, messageId: { not: null } },
          select: { id: true, targetId: true, channelId: true, messageId: true },
        },
      },
    });
    return contests.flatMap((contest) => contest.notifications.flatMap((notification) =>
      notification.channelId && notification.messageId
        ? [{ ...notification, channelId: notification.channelId, messageId: notification.messageId }]
        : [],
    ));
  },

  async listNotificationCandidates(targetId: string, today: string, limit: number): Promise<StoredContest[]> {
    const rows = await prisma.contest.findMany({
      where: {
        status: "ACTIVE",
        applyEnd: { gte: today },
        notifications: { none: { targetId } },
      },
      orderBy: [{ applyEnd: "asc" }, { createdAt: "asc" }],
      take: limit,
    });
    return rows.map(toStoredContest);
  },

  async reserveDailySlots(targetId: string, today: string, maxPerDay: number, requested: number): Promise<number> {
    return prisma.$transaction(async (tx) => {
      const current = await tx.contestNotifierState.findUnique({ where: { targetId } });
      const used = current?.quotaDate === today ? current.reservedCount : 0;
      const slots = Math.max(0, Math.min(requested, maxPerDay - used));
      await tx.contestNotifierState.upsert({
        where: { targetId },
        create: { targetId, quotaDate: today, reservedCount: slots },
        update: { quotaDate: today, reservedCount: used + slots },
      });
      return slots;
    });
  },

  async claimNotification(targetId: string, contestId: string): Promise<string | null> {
    try {
      const claim = await prisma.contestNotification.create({ data: { targetId, contestId } });
      return claim.id;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return null;
      throw error;
    }
  },

  async completeNotification(notificationId: string, channelId: string, messageId: string): Promise<void> {
    await prisma.contestNotification.update({
      where: { id: notificationId },
      data: { channelId, messageId, sentAt: new Date(), deletedAt: null },
    });
  },

  async releaseNotificationClaim(notificationId: string): Promise<void> {
    await prisma.contestNotification.delete({ where: { id: notificationId } });
  },

  async markNotificationDeleted(notificationId: string): Promise<void> {
    await prisma.contestNotification.update({
      where: { id: notificationId },
      data: { deletedAt: new Date() },
    });
  },
};

export async function hasContestNotification(targetId: string, contestId: string, messageId: string): Promise<boolean> {
  const count = await prisma.contestNotification.count({
    where: { targetId, contestId, messageId, deletedAt: null },
  });
  return count > 0;
}

export async function setContestPreference(
  targetId: string,
  userId: string,
  contestId: string,
  status: ContestPreferenceStatus,
): Promise<void> {
  await prisma.contestPreference.upsert({
    where: { targetId_userId_contestId: { targetId, userId, contestId } },
    create: { targetId, userId, contestId, status },
    update: { status },
  });
}

export async function listInterestedUserIds(targetId: string, contestId: string): Promise<string[]> {
  const rows = await prisma.contestPreference.findMany({
    where: { targetId, contestId, status: "INTERESTED" },
    orderBy: { updatedAt: "asc" },
    select: { userId: true },
    take: 20,
  });
  return rows.map((row) => row.userId);
}

export async function upsertContestSubscription(input: {
  channelId: string;
  guildId: string;
  createdByUserId: string;
}): Promise<ContestSubscriptionRecord> {
  return prisma.contestSubscription.upsert({
    where: { channelId: input.channelId },
    create: { ...input, enabled: true },
    update: { guildId: input.guildId, createdByUserId: input.createdByUserId, enabled: true },
    select: { channelId: true, guildId: true, createdByUserId: true, enabled: true },
  });
}

export async function disableContestSubscription(channelId: string): Promise<boolean> {
  const result = await prisma.contestSubscription.updateMany({
    where: { channelId, enabled: true },
    data: { enabled: false },
  });
  return result.count > 0;
}

export async function getContestSubscription(channelId: string): Promise<ContestSubscriptionRecord | null> {
  return prisma.contestSubscription.findUnique({
    where: { channelId },
    select: { channelId: true, guildId: true, createdByUserId: true, enabled: true },
  });
}

export async function listActiveContestSubscriptions(): Promise<ContestSubscriptionRecord[]> {
  return prisma.contestSubscription.findMany({
    where: { enabled: true },
    orderBy: { createdAt: "asc" },
    select: { channelId: true, guildId: true, createdByUserId: true, enabled: true },
  });
}
