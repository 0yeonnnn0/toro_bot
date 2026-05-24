import type { Client, Message } from "discord.js";
import { getReply, lastUsedModel } from "./ai";
import * as history from "./history";
import * as rag from "./rag";
import { state, addLog, addError, trackUser, trackKeywords } from "../shared/state";
import { enqueue, markUserRequest } from "./queue";
import { fetchUrlContext } from "./scrape";
import { getUserContext, extractAndSave } from "./vault";
import type { ImageData } from "./history";

// @이름 → <@유저ID> 변환
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
const MAX_IMAGE_SIZE = 4 * 1024 * 1024; // 4MB

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

const conversationBuffer = new Map<string, { content: string }[]>();
const BUFFER_SIZE = 5;

// ── Message deduplication ──
const recentMessages = new Set<string>();
const DEDUP_TTL = 10_000; // 10s
// 멘션 메시지 처리 중 추적 (동시 실행 방지)
const processingMentions = new Set<string>();

function isDuplicate(messageId: string): boolean {
  if (recentMessages.has(messageId)) return true;
  recentMessages.add(messageId);
  setTimeout(() => recentMessages.delete(messageId), DEDUP_TTL);
  return false;
}

// ── Setup ──
let handlerRegistered = false;
export function setupMessageHandler(client: Client): void {
  if (handlerRegistered) {
    console.error(`[WARN] setupMessageHandler가 2번 호출됨! 중복 등록 방지.`);
    return;
  }
  handlerRegistered = true;
  console.log(`[INIT] messageCreate 핸들러 등록, 기존 리스너 수: ${client.listenerCount("messageCreate")}`);

  client.on("messageCreate", async (message: Message) => {
    if (message.author.bot) return;
    if (isDuplicate(message.id)) {
      console.log(`[DEDUP] 중복 메시지 무시: id=${message.id} author=${message.author.displayName}`);
      return;
    }
    const channelId = message.channel.id;
    const guildName = message.guild?.name || "DM";
    const channelName = "name" in message.channel ? (message.channel as any).name as string : "unknown";
    const cleanContent = message.content.replace(/<@!?\d+>/g, "").trim();

    const imageData = await extractImage(message);

    const isMentioned = message.mentions.has(client.user!);
    console.log(`[MSG] id=${message.id} mention=${isMentioned} channel=${channelName} author=${message.author.displayName} content="${cleanContent.slice(0, 30)}"`);
    const shouldLog = isMentioned;

    history.addMessage(channelId, {
      role: "user",
      content: `${message.author.displayName}: ${cleanContent}${imageData ? " [이미지 첨부]" : ""}`,
      imageData,
    });

    if (shouldLog) {
      state.stats.messagesProcessed++;
      trackKeywords(cleanContent);

      if (!conversationBuffer.has(channelId)) {
        conversationBuffer.set(channelId, []);
      }
      const buffer = conversationBuffer.get(channelId)!;
      buffer.push({ content: `${message.author.displayName}: ${cleanContent}` });
      if (buffer.length >= BUFFER_SIZE) {
        rag.storeConversation({
          channel: channelName,
          messages: buffer.splice(0),
          timestamp: Date.now(),
        });
      }

      // 멘션은 멘션 핸들러에서 로그를 남기므로 여기서는 비멘션만 기록
      if (!isMentioned) {
        addLog({
          guild: guildName,
          channel: channelName,
          author: message.author.displayName,
          content: cleanContent,
          botReplied: false,
          triggerReason: null,
          botReply: null,
          responseTime: null,
          ragHits: 0,
          error: null,
          model: null,
        });
      }
    }

    // 일반 채팅은 최근 히스토리에만 두고, 자동 끼어들기/RAG 장기 저장은 하지 않는다.
    if (!isMentioned) {
      return;
    }

    // ── Mentioned: always reply ──
    if (processingMentions.has(message.id)) {
      console.error(`[MENTION:DUPLICATE] id=${message.id} 이미 처리 중! 스킵`);
      return;
    }
    processingMentions.add(message.id);
    setTimeout(() => processingMentions.delete(message.id), 60_000);

    console.log(`[MENTION] id=${message.id} channel=${channelName} author=${message.author.displayName}`);
    trackUser(message.author.id, message.author.displayName, true);
    markUserRequest(message.author.id);
    if ("sendTyping" in message.channel) (message.channel as any).sendTyping().catch(() => {});

    const startTime = Date.now();
    let replySent = false;
    console.log(`[MENTION:START] id=${message.id} timestamp=${startTime}`);

    try {
      let ragHitCount = 0;
      const reply = await enqueue(async () => {
        const channelHistory = history.getHistory(channelId);
        let ragResults: any[] = [];
        try {
          ragResults = await rag.searchRelevant(cleanContent);
        } catch {}
        ragHitCount = ragResults.length;
        const urlContext = await fetchUrlContext(cleanContent);
        const vaultContext = getUserContext(message.author.displayName);
        const ragContext = rag.formatContext(ragResults) + urlContext + vaultContext;
        return getReply(channelHistory, ragContext, message.author.id);
      });

      const responseTime = Date.now() - startTime;

      if (!reply) return;

      const resolved = resolveMentions(reply, message);
      console.log(`[MENTION:REPLY] id=${message.id} replySent=${replySent} reply="${resolved.slice(0, 50)}"`);
      await message.reply(resolved);
      replySent = true;
      console.log(`[MENTION:SENT] id=${message.id} replySent=true`);
      history.addMessage(channelId, { role: "assistant", content: reply });
      state.stats.repliesSent++;

      // Background: extract user info from conversation
      const extractHistory = history.getHistory(channelId).slice(-10);
      extractAndSave(message.author.displayName, extractHistory).catch(() => {});

      addLog({
        guild: guildName,
        channel: channelName,
        author: message.author.displayName,
        content: cleanContent,
        botReplied: true,
        triggerReason: "mention",
        botReply: resolved,
        responseTime,
        ragHits: ragHitCount,
        error: null,
        model: lastUsedModel,
      });
    } catch (err) {
      console.error(`[MENTION:CATCH:ENTRY] id=${message.id} replySent=${replySent} error="${(err as Error).message?.slice(0, 100)}"`);
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
        author: message.author.displayName,
        content: cleanContent,
        botReplied: false,
        triggerReason: "mention",
        botReply: null,
        responseTime,
        ragHits: 0,
        error: isRateLimit ? "rate_limit" : "api_error",
        model: null,
      });

      console.error(`[MENTION:CATCH] id=${message.id} replySent=${replySent} error="${(err as Error).message}"`);
      // 에러 시 Discord에 에러 메시지를 보내지 않음 — 정상 응답이 별도로 도착하는 경우가 있어 중복 방지
      // 레이트 리밋일 때만 유저에게 알림
      if (!replySent && isRateLimit) {
        await message.reply("오늘은 너무 많이 떠들었다냥... 내일 다시 돌아온다냥! >w<").catch(() => {});
      }
    }
  });
}
