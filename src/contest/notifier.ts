import type { Client } from "discord.js";
import { addError, addEvent } from "../shared/state";
import {
  buildContestMessage,
  cleanupExpiredContestNotifications,
  runContestNotificationCycle,
} from "./notification";
import { GithubIssueContestSource } from "./source";
import {
  contestStore,
  getContestSubscription,
  listActiveContestSubscriptions,
} from "./store";
import type { ContestMessenger, StoredContest } from "./types";

function kstDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${value.year}-${value.month}-${value.day}`;
}

export class DiscordChannelContestMessenger implements ContestMessenger {
  constructor(private readonly client: Client) {}

  async sendContest(targetId: string, contest: StoredContest): Promise<{ channelId: string; messageId: string }> {
    const channel = await this.client.channels.fetch(targetId);
    if (!channel || !channel.isSendable()) throw new Error(`공모전 알림을 보낼 수 없는 채널: ${targetId}`);
    const message = await channel.send({
      content: "관심: 아직 없음",
      ...buildContestMessage(contest),
    });
    return { channelId: message.channelId, messageId: message.id };
  }

  async deleteMessage(_targetId: string, channelId: string, messageId: string): Promise<void> {
    const channel = await this.client.channels.fetch(channelId);
    if (!channel || !channel.isTextBased()) throw new Error(`공모전 알림을 삭제할 수 없는 채널: ${channelId}`);
    try {
      const message = await channel.messages.fetch(messageId);
      await message.delete();
    } catch (error) {
      if (typeof error === "object" && error && "code" in error && error.code === 10008) return;
      throw error;
    }
  }
}

function maxNotifications(): number {
  return Math.min(20, Math.max(1, Number.parseInt(process.env.CONTEST_MAX_NOTIFICATIONS || "5", 10) || 5));
}

const runningTargets = new Set<string>();

export async function runContestNotifierNow(
  client: Client,
  channelId: string,
  options: { skipExpirationCleanup?: boolean } = {},
) {
  const subscription = await getContestSubscription(channelId);
  if (!subscription?.enabled || runningTargets.has(channelId)) {
    return { discovered: 0, expired: 0, sent: 0, failures: 0, sourceFailed: false };
  }
  runningTargets.add(channelId);
  try {
    return await runContestNotificationCycle({
      today: kstDate(),
      targetId: channelId,
      maxNotifications: maxNotifications(),
      source: new GithubIssueContestSource(),
      store: contestStore,
      messenger: new DiscordChannelContestMessenger(client),
      skipExpirationCleanup: options.skipExpirationCleanup,
    });
  } finally {
    runningTargets.delete(channelId);
  }
}

export async function runContestNotifierPass(client: Client): Promise<void> {
  const messenger = new DiscordChannelContestMessenger(client);
  const cleanup = await cleanupExpiredContestNotifications({
    today: kstDate(),
    store: contestStore,
    messenger,
  });
  if (cleanup.deleted > 0 || cleanup.failures > 0) {
    addEvent("contest_cleanup", `만료 삭제 ${cleanup.deleted}건 · 실패 ${cleanup.failures}건`);
  }

  const subscriptions = await listActiveContestSubscriptions();
  for (const subscription of subscriptions) {
    try {
      const result = await runContestNotifierNow(client, subscription.channelId, { skipExpirationCleanup: true });
      addEvent(
        "contest_cycle",
        `채널 ${subscription.channelId} · 수집 ${result.discovered}건 · 게시 ${result.sent}건 · 실패 ${result.failures}건${result.sourceFailed ? " · 소스 조회 실패" : ""}`,
      );
    } catch (error) {
      addError("contest", error instanceof Error ? error.message : String(error));
    }
  }
}

export function startContestNotifier(client: Client): void {
  if (process.env.CONTEST_NOTIFICATIONS_ENABLED?.trim().toLowerCase() === "false") return;
  const intervalMs = Math.max(60_000, Number.parseInt(process.env.CONTEST_POLL_INTERVAL_MS || "86400000", 10) || 86_400_000);

  void runContestNotifierPass(client);
  const timer = setInterval(() => void runContestNotifierPass(client), intervalMs);
  timer.unref();
}
