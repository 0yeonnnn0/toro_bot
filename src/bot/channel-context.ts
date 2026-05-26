import type { Message } from "discord.js";
import type { HistoryMessage, ImageData } from "./history";

export const MENTION_CONTEXT_WINDOW_MS = 2 * 60 * 60 * 1000;
export const MENTION_CONTEXT_MIN_MESSAGES = 50;
export const MENTION_CONTEXT_PAGE_SIZE = 100;
export const MENTION_CONTEXT_MAX_FETCH = 200;

export interface ContextCandidate {
  id: string;
  createdTimestamp: number;
  authorId: string;
  authorName: string;
  authorBot: boolean;
  content: string;
  hasImage?: boolean;
}

function cleanDiscordContent(content: string, botUserId?: string): string {
  let cleaned = content;
  if (botUserId) {
    cleaned = cleaned.replace(new RegExp(`<@!?${botUserId}>`, "g"), "");
  }
  return cleaned.replace(/<@!?\d+>/g, "").replace(/\s+/g, " ").trim();
}

export function selectMentionContextMessages(
  candidatesNewestFirst: ContextCandidate[],
  now: number,
  botUserId?: string,
): HistoryMessage[] {
  const cutoff = now - MENTION_CONTEXT_WINDOW_MS;
  const usable = candidatesNewestFirst.filter((msg) => {
    if (msg.authorBot && msg.authorId !== botUserId) return false;
    return cleanDiscordContent(msg.content, botUserId).length > 0 || msg.hasImage;
  });
  const withinWindow = usable.filter((msg) => msg.createdTimestamp >= cutoff);
  const selected = withinWindow.length >= MENTION_CONTEXT_MIN_MESSAGES
    ? withinWindow
    : usable.slice(0, MENTION_CONTEXT_MIN_MESSAGES);

  return selected
    .slice()
    .reverse()
    .map((msg) => {
      const cleaned = cleanDiscordContent(msg.content, botUserId);
      const content = `${msg.authorName}: ${cleaned}${msg.hasImage ? " [이미지 첨부]" : ""}`.trim();
      return { role: msg.authorId === botUserId ? "assistant" : "user", content } as HistoryMessage;
    });
}

export async function getMentionContextHistory(
  message: Message,
  cleanCurrentContent: string,
  currentImageData?: ImageData,
  botUserId?: string,
): Promise<HistoryMessage[]> {
  if (!("messages" in message.channel) || typeof (message.channel as any).messages?.fetch !== "function") {
    return [{
      role: "user",
      content: `${message.author.displayName}: ${cleanCurrentContent}${currentImageData ? " [이미지 첨부]" : ""}`,
      imageData: currentImageData,
    }];
  }

  const fetched: ContextCandidate[] = [{
    id: message.id,
    createdTimestamp: message.createdTimestamp,
    authorId: message.author.id,
    authorName: message.author.displayName,
    authorBot: message.author.bot,
    content: cleanCurrentContent,
    hasImage: Boolean(currentImageData),
  }];

  let before: string | undefined = message.id;
  const cutoff = Date.now() - MENTION_CONTEXT_WINDOW_MS;

  while (fetched.length < MENTION_CONTEXT_MAX_FETCH && before) {
    const batch = await (message.channel as any).messages.fetch({
      limit: Math.min(MENTION_CONTEXT_PAGE_SIZE, MENTION_CONTEXT_MAX_FETCH - fetched.length),
      before,
    });
    const values = [...batch.values()] as Message[];
    if (values.length === 0) break;

    for (const msg of values) {
      const hasImage = msg.attachments.some((attachment) => attachment.contentType?.startsWith("image/"));
      fetched.push({
        id: msg.id,
        createdTimestamp: msg.createdTimestamp,
        authorId: msg.author.id,
        authorName: msg.author.displayName,
        authorBot: msg.author.bot,
        content: msg.content,
        hasImage,
      });
    }

    const oldest = values[values.length - 1];
    before = oldest?.id;
    const enoughRecentWindow = fetched.filter((msg) => msg.createdTimestamp >= cutoff).length >= MENTION_CONTEXT_MIN_MESSAGES;
    const reachedOlderThanWindow = Boolean(oldest && oldest.createdTimestamp < cutoff);
    if (enoughRecentWindow && reachedOlderThanWindow) break;
    if (reachedOlderThanWindow && fetched.length >= MENTION_CONTEXT_MIN_MESSAGES) break;
  }

  const selected = selectMentionContextMessages(fetched, Date.now(), botUserId);
  const last = selected[selected.length - 1];
  if (last && last.content.startsWith(`${message.author.displayName}:`) && currentImageData) {
    last.imageData = currentImageData;
  }
  return selected;
}
