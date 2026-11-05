import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  type MessageCreateOptions,
} from "discord.js";
import type { ContestMessenger, ContestSource, ContestCycleStore, StoredContest } from "./types";

export type ContestAction = "interest" | "ignore";

export function parseContestCustomId(customId: string): { action: ContestAction; contestId: string } | null {
  const match = customId.match(/^contest:(interest|ignore):([^:]+)$/);
  return match ? { action: match[1] as ContestAction, contestId: match[2] } : null;
}

export function buildContestMessage(contest: StoredContest): MessageCreateOptions {
  const title = contest.title.slice(0, 256);
  const summary = (contest.summary || "상세 내용은 원문에서 확인해줘냥.").slice(0, 4096);
  const category = (contest.category || "미분류").slice(0, 1024);
  const host = (contest.host || "미상").slice(0, 1024);
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setURL(contest.sourceUrl)
    .setDescription(summary)
    .addFields(
      { name: "마감", value: contest.applyEnd.slice(0, 1024), inline: true },
      { name: "분야", value: category, inline: true },
      { name: "주최", value: host, inline: false },
    )
    .setFooter({ text: "AI 요약 정보일 수 있으니 지원 전 원문을 확인해줘냥" });

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`contest:interest:${contest.id}`)
      .setLabel("관심 있어요")
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`contest:ignore:${contest.id}`)
      .setLabel("관심 없어요")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setLabel("원문 보기")
      .setStyle(ButtonStyle.Link)
      .setURL(contest.sourceUrl),
  );

  return { embeds: [embed], components: [row], allowedMentions: { parse: [] } };
}

export async function runContestNotificationCycle(input: {
  today: string;
  userId: string;
  maxNotifications: number;
  source: ContestSource;
  store: ContestCycleStore;
  messenger: ContestMessenger;
}): Promise<{ discovered: number; expired: number; sent: number; failures: number; sourceFailed: boolean }> {
  let failures = 0;
  const expired = await input.store.expireBefore(input.today);
  let deleted = 0;
  for (const notification of expired) {
    try {
      await input.messenger.deleteMessage(notification.userId, notification.channelId, notification.messageId);
      await input.store.markNotificationDeleted(notification.id);
      deleted += 1;
    } catch {
      failures += 1;
    }
  }

  let contests = [] as Awaited<ReturnType<ContestSource["fetchActiveContests"]>>;
  let sourceFailed = false;
  try {
    contests = await input.source.fetchActiveContests();
    await input.store.upsertMany(contests);
  } catch {
    sourceFailed = true;
  }

  const candidates = await input.store.listNotificationCandidates(input.userId, input.today, input.maxNotifications);
  const slots = await input.store.reserveDailySlots(
    input.userId,
    input.today,
    input.maxNotifications,
    candidates.length,
  );
  let sent = 0;
  for (const contest of candidates.slice(0, slots)) {
    const claimId = await input.store.claimNotification(input.userId, contest.id);
    if (!claimId) continue;
    let message: Awaited<ReturnType<ContestMessenger["sendContest"]>>;
    try {
      message = await input.messenger.sendContest(input.userId, contest);
    } catch {
      await input.store.releaseNotificationClaim(claimId);
      failures += 1;
      continue;
    }
    try {
      await input.store.completeNotification(claimId, message.channelId, message.messageId);
      sent += 1;
    } catch {
      // DM 전송 뒤 기록 실패는 중복 발송보다 누락을 택해 claim을 유지한다.
      failures += 1;
    }
  }

  return { discovered: contests.length, expired: deleted, sent, failures, sourceFailed };
}
