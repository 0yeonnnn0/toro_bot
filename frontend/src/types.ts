export interface BotStatus {
  online: boolean;
  uptime: number;
  guilds: number;
  stats: {
    messagesProcessed: number;
    repliesSent: number;
    startedAt: number;
  };
  queue: {
    activeCount: number;
    queueLength: number;
    maxConcurrent: number;
  };
  config: {
    replyChance: number;
    aiProvider: string;
    model: string;
  };
}

export interface UserStat {
  id: string;
  displayName: string;
  messages: number;
  gotReplies: number;
}

export interface Keyword {
  word: string;
  count: number;
}

export interface LogEntry {
  timestamp: number;
  guild?: string;
  channel: string;
  author: string;
  content: string;
  botReplied: boolean;
  triggerReason: "mention" | "random" | null;
  botReply: string | null;
  responseTime: number | null;
  ragHits: number;
  error: string | null;
  model: string | null;
}

export interface EventEntry {
  timestamp: number;
  type: string;
  detail: string;
}

export interface ErrorEntry {
  timestamp: number;
  type: string;
  message: string;
  detail: string;
}

export interface PresetInfo {
  id: string;
  name: string;
  description: string;
  active: boolean;
  enabled: boolean;
}

export interface Preset extends PresetInfo {
  prompt: string;
  ownerSuffix: string;
  userSuffix: string;
  voice: string;
}

export interface RagStats {
  vectorCount: number;
  indexCreated: boolean;
}

export interface RagVector {
  id: string;
  channel: string;
  timestamp: number;
  text: string;
  messageCount: number;
  hits: number;
  lastHit: number | null;
}

export interface SearchResult {
  id: string;
  text: string;
  channel: string;
  timestamp: number;
  score: number;
}

export interface TimelineEntry {
  date: string;
  stored: number;
  hits: number;
}

export interface ChatLogEntry {
  id: string;
  sessionId: string;
  characterId: string;
  characterName: string;
  nickname: string;
  userMessage: string;
  botReply: string;
  model: string;
  timestamp: number;
}


export interface StoredMemo {
  id: string;
  team: { name: string; slug: string };
  authorDiscordUserId: string;
  subjectDiscordUserId: string | null;
  content: string;
  sourceGuildId: string | null;
  sourceChannelId: string | null;
  sourceMessageId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoredConversation {
  id: string;
  team: { name: string; slug: string };
  guildId: string | null;
  channelId: string;
  updatedAt: string;
  messages: Array<{
    id: string;
    role: string;
    displayName: string | null;
    discordUserId: string | null;
    content: string;
    createdAt: string;
  }>;
}
