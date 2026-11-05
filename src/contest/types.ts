export type ContestTrack = "it" | "non-it";
export type ContestPreferenceStatus = "INTERESTED" | "IGNORED";

export interface ContestCandidate {
  canonicalKey: string;
  title: string;
  host: string | null;
  category: string | null;
  applyEnd: string;
  sourceUrl: string;
  sourceIssueUrl: string;
  summary: string | null;
  track: ContestTrack;
}

export interface StoredContest extends ContestCandidate {
  id: string;
}

export interface ExpiredNotification {
  id: string;
  targetId: string;
  channelId: string;
  messageId: string;
}

export interface ContestCycleStore {
  upsertMany(contests: ContestCandidate[]): Promise<void>;
  expireBefore(today: string): Promise<ExpiredNotification[]>;
  listNotificationCandidates(targetId: string, today: string, limit: number): Promise<StoredContest[]>;
  reserveDailySlots(targetId: string, today: string, maxPerDay: number, requested: number): Promise<number>;
  claimNotification(targetId: string, contestId: string): Promise<string | null>;
  completeNotification(notificationId: string, channelId: string, messageId: string): Promise<void>;
  releaseNotificationClaim(notificationId: string): Promise<void>;
  markNotificationDeleted(notificationId: string): Promise<void>;
}

export interface ContestSource {
  fetchActiveContests(): Promise<ContestCandidate[]>;
}

export interface ContestMessenger {
  sendContest(targetId: string, contest: StoredContest): Promise<{ channelId: string; messageId: string }>;
  deleteMessage(targetId: string, channelId: string, messageId: string): Promise<void>;
}

export interface ContestSubscriptionRecord {
  channelId: string;
  guildId: string;
  createdByUserId: string;
  enabled: boolean;
}
