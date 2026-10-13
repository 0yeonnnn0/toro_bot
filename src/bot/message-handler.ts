import { type AttachmentBuilder, type Client, type Message } from "discord.js";
import { getReply, lastUsedModel } from "./ai";
import { state, addLog, addError } from "../shared/state";
import { enqueue, markUserRequest } from "./queue";
import { fetchWebSearchContext } from "./scrape";
import { getMentionContextHistory } from "./channel-context";
import { isChannelMuted } from "./commands/mute";
import type { ImageData } from "./history";
import { extractImagePrompt, generateImage, isImageGenerationRequest } from "./draw";
import { extractImageSearchQuery, isImageSearchRequest, searchImageAttachment } from "./image-search";
import { getMessagePolicy } from "./message-policy";

const IMAGE_FAILURE_MESSAGE = "이미지 생성에 실패했다냥... @д@";

function resolveMentions(text: string, message: Message): string {
  const guild = message.guild;
  if (!guild) return text;
  return text.replace(/@(\S+)/g, (match, name) => {
    const member = guild.members.cache.find(m =>
      m.displayName === name || m.user.username === name || m.nickname === name
    );
    return member ? `<@${member.id}>` : match;
  });
}

const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const MAX_IMAGE_SIZE = 4 * 1024 * 1024;

async function extractImage(message: Message): Promise<ImageData | undefined> {
  if (!state.config.imageRecognition) return undefined;
  const attachment = message.attachments.find(
    a => a.contentType && IMAGE_MIMES.has(a.contentType) && (a.size || 0) <= MAX_IMAGE_SIZE
  );
  if (!attachment) return undefined;
  try {
    const res = await fetch(attachment.url);
    const buf = Buffer.from(await res.arrayBuffer());
    return { mimeType: attachment.contentType!, data: buf.toString("base64") };
  } catch {
    return undefined;
  }
}

const recentMessages = new Set<string>();
const DEDUP_TTL = 10_000;
const processingMentions = new Set<string>();

type MentionResponse = string | {
  content: string;
  files?: AttachmentBuilder[];
};

function isDuplicate(messageId: string): boolean {
  if (recentMessages.has(messageId)) return true;
  recentMessages.add(messageId);
  setTimeout(() => recentMessages.delete(messageId), DEDUP_TTL);
  return false;
}

let handlerRegistered = false;
export function setupMessageHandler(client: Client): void {
  if (handlerRegistered) {
    console.error("[WARN] setupMessageHandler가 2번 호출됨! 중복 등록 방지.");
    return;
  }
  handlerRegistered = true;
  console.log(`[INIT] messageCreate 핸들러 등록, 기존 리스너 수: ${client.listenerCount("messageCreate")}`);

  client.on("messageCreate", async (message: Message) => {
    if (message.author.bot || isDuplicate(message.id)) return;

    const channelId = message.channel.id;
    const guildName = message.guild?.name || "DM";
    const channelName = "name" in message.channel ? (message.channel as any).name as string : "unknown";
    const cleanContent = message.content.replace(/<@!?\d+>/g, "").trim();
    const isMentioned = message.mentions.has(client.user!);
    const policy = getMessagePolicy({ isMentioned, isMuted: isChannelMuted(channelId) });

    if (!policy.shouldReply) return;

    if (processingMentions.has(message.id)) return;
    processingMentions.add(message.id);
    setTimeout(() => processingMentions.delete(message.id), 60_000);

    const imageData = await extractImage(message);
    state.stats.messagesProcessed++;
    markUserRequest(message.author.id);
    if ("sendTyping" in message.channel) (message.channel as any).sendTyping().catch(() => {});

    const startTime = Date.now();
    let replySent = false;

    try {
      const reply = await enqueue(async () => {
        const requestHistory = await getMentionContextHistory(message, cleanContent, imageData, client.user?.id);
        const webSearchContext = await fetchWebSearchContext(cleanContent);
        const requestContext = webSearchContext;

        if (isImageSearchRequest(cleanContent)) {
          const imageQuery = extractImageSearchQuery(cleanContent);
          const result = await searchImageAttachment(imageQuery);
          if (!result) return "사진 검색 결과를 못 가져왔다냥... @д@";
          const content = `**${imageQuery}** 사진 가져왔다냥${result.pageUrl ? `\n출처: ${result.pageUrl}` : ""}`;
          return { content, files: [result.attachment] };
        }

        if (isImageGenerationRequest(cleanContent)) {
          const imagePrompt = extractImagePrompt(cleanContent);
          const result = await generateImage(imagePrompt, "flash");
          if (!result) return IMAGE_FAILURE_MESSAGE;
          const label = result.provider === "codex" ? "codex image" : "openai image";
          return { content: `**${imagePrompt}** (${label})`, files: [result.attachment] };
        }

        return getReply(requestHistory, requestContext, message.author.id);
      });

      if (!reply) return;
      const response = reply as MentionResponse;
      const rawContent = typeof response === "string" ? response : response.content;
      const resolved = resolveMentions(rawContent, message);

      if (typeof response === "string") {
        await message.reply(resolved);
      } else {
        await message.reply({ content: resolved, files: response.files ?? [] });
      }
      replySent = true;
      state.stats.repliesSent++;

      addLog({
        guild: guildName,
        channel: channelName,
        author: "[discord user]",
        content: "[ephemeral mention]",
        botReplied: true,
        triggerReason: "mention",
        botReply: null,
        responseTime: Date.now() - startTime,
        ragHits: 0,
        error: null,
        model: lastUsedModel,
      });
    } catch (err) {
      const responseTime = Date.now() - startTime;
      const isRateLimit = (err as Error).message?.includes("429") || (err as Error).message?.includes("quota");

      addError(
        isRateLimit ? "rate_limit" : "api_error",
        (err as Error).message,
        `channel: ${channelName}, guild: ${guildName}`
      );
      addLog({
        guild: guildName,
        channel: channelName,
        author: "[discord user]",
        content: "[ephemeral mention]",
        botReplied: false,
        triggerReason: "mention",
        botReply: null,
        responseTime,
        ragHits: 0,
        error: isRateLimit ? "rate_limit" : "api_error",
        model: null,
      });

      if (!replySent && isRateLimit) {
        await message.reply("오늘은 너무 많이 떠들었다냥... 내일 다시 돌아온다냥! >w<").catch(() => {});
      }
    }
  });
}
