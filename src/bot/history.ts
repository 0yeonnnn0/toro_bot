export interface ImageData {
  mimeType: string;
  data: string; // base64
}

export interface HistoryMessage {
  role: "user" | "assistant";
  content: string;
  discordUserId?: string;
  displayName?: string;
  imageData?: ImageData;
}

const MAX_HISTORY = 30;
const channelHistory = new Map<string, HistoryMessage[]>();

export function addMessage(channelId: string, message: HistoryMessage): void {
  if (!channelHistory.has(channelId)) {
    channelHistory.set(channelId, []);
  }
  const history = channelHistory.get(channelId)!;
  history.push(message);
  if (history.length > MAX_HISTORY) {
    history.shift();
  }
}

export function getHistory(channelId: string): HistoryMessage[] {
  return channelHistory.get(channelId) || [];
}
