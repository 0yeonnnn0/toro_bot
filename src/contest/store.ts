import { Prisma } from "@prisma/client";
import { prisma } from "../db/client";
import type { ContestCandidate, ContestPreferenceStatus, ContestCycleStore, ExpiredNotification, StoredContest } from "./types";

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
          select: { id: true, userId: true, channelId: true, messageId: true },
        },
      },
    });
    return contests.flatMap((contest) => contest.notifications.flatMap((notification) =>
      notification.channelId && notification.messageId
        ? [{ ...notification, channelId: notification.channelId, messageId: notification.messageId }]
        : [],
    ));
  },

  async listNotificationCandidates(userId: string, today: string, limit: number): Promise<StoredContest[]> {
    const rows = await prisma.contest.findMany({
      where: {
        status: "ACTIVE",
        applyEnd: { gte: today },
        preferences: { none: { userId, status: "IGNORED" } },
        notifications: { none: { userId } },
      },
      orderBy: [{ applyEnd: "asc" }, { createdAt: "asc" }],
      take: limit,
    });
    return rows.map(toStoredContest);
  },

  async reserveDailySlots(userId: string, today: string, maxPerDay: number, requested: number): Promise<number> {
    return prisma.$transaction(async (tx) => {
      const current = await tx.contestNotifierState.findUnique({ where: { userId } });
      const used = current?.quotaDate === today ? current.reservedCount : 0;
      const slots = Math.max(0, Math.min(requested, maxPerDay - used));
      await tx.contestNotifierState.upsert({
        where: { userId },
        create: { userId, quotaDate: today, reservedCount: slots },
        update: { quotaDate: today, reservedCount: used + slots },
      });
      return slots;
    });
  },

  async claimNotification(userId: string, contestId: string): Promise<string | null> {
    try {
      const claim = await prisma.contestNotification.create({ data: { userId, contestId } });
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

export async function hasContestNotification(userId: string, contestId: string, messageId: string): Promise<boolean> {
  const count = await prisma.contestNotification.count({
    where: { userId, contestId, messageId, deletedAt: null },
  });
  return count > 0;
}

export async function setContestPreference(userId: string, contestId: string, status: ContestPreferenceStatus): Promise<void> {
  await prisma.contestPreference.upsert({
    where: { userId_contestId: { userId, contestId } },
    create: { userId, contestId, status },
    update: { status },
  });
}
