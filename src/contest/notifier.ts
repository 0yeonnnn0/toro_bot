import type { Client } from "discord.js";
import { addError, addEvent } from "../shared/state";
import { buildContestMessage, runContestNotificationCycle } from "./notification";
import { GithubIssueContestSource } from "./source";
import { contestStore } from "./store";
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

class DiscordContestMessenger implements ContestMessenger {
  constructor(private readonly client: Client) {}

  async sendContest(userId: string, contest: StoredContest): Promise<{ channelId: string; messageId: string }> {
    const user = await this.client.users.fetch(userId);
    const message = await user.send(buildContestMessage(contest));
    return { channelId: message.channelId, messageId: message.id };
  }

  async deleteMessage(userId: string, _channelId: string, messageId: string): Promise<void> {
    const user = await this.client.users.fetch(userId);
    const channel = await user.createDM();
    try {
      const message = await channel.messages.fetch(messageId);
      await message.delete();
    } catch (error) {
      if (typeof error === "object" && error && "code" in error && error.code === 10008) return;
      throw error;
    }
  }
}

export function startContestNotifier(client: Client): void {
  if (process.env.CONTEST_NOTIFICATIONS_ENABLED?.trim().toLowerCase() === "false") return;
  const userId = process.env.OWNER_ID?.trim();
  if (!userId) {
    addEvent("contest_disabled", "OWNER_ID가 없어 공모전 DM 알림을 시작하지 않음");
    return;
  }

  const maxNotifications = Math.min(20, Math.max(1, Number.parseInt(process.env.CONTEST_MAX_NOTIFICATIONS || "5", 10) || 5));
  const intervalMs = Math.max(60_000, Number.parseInt(process.env.CONTEST_POLL_INTERVAL_MS || "86400000", 10) || 86_400_000);
  const source = new GithubIssueContestSource();
  const messenger = new DiscordContestMessenger(client);
  let running = false;

  const run = async () => {
    if (running) return;
    running = true;
    try {
      const result = await runContestNotificationCycle({
        today: kstDate(),
        userId,
        maxNotifications,
        source,
        store: contestStore,
        messenger,
      });
      addEvent("contest_cycle", `수집 ${result.discovered}건 · 만료 삭제 ${result.expired}건 · DM ${result.sent}건 · 실패 ${result.failures}건${result.sourceFailed ? " · 소스 조회 실패" : ""}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      addError("contest", message);
    } finally {
      running = false;
    }
  };

  void run();
  const timer = setInterval(() => void run(), intervalMs);
  timer.unref();
}
