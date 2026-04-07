import type { Client, Message } from "discord.js";
import { getReply, judgeAndReply, lastUsedModel } from "./ai";
import * as history from "./history";
import * as rag from "./rag";
import { state, addLog, addError, trackUser, trackKeywords } from "../shared/state";
import { enqueue, canUserRequest, markUserRequest } from "./queue";
import { getPresets, setActivePreset, getActivePresetId } from "./prompt";
import { isChannelMuted } from "./commands";
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

// Interval mode state: timer + message counter per channel
interface ChannelJudgeState {
  timer: ReturnType<typeof setTimeout>;
  msgCount: number;
}
const judgeState = new Map<string, ChannelJudgeState>();

// Auto mode: 30s cooldown per channel — wait for conversation to build up
const AUTO_COOLDOWN_MS = 30 * 1000;
const autoCooldowns = new Map<string, ReturnType<typeof setTimeout>>();

// ── Message deduplication ──
const recentMessages = new Set<string>();
const DEDUP_TTL = 10_000; // 10s

function isDuplicate(messageId: string): boolean {
  if (recentMessages.has(messageId)) return true;
  recentMessages.add(messageId);
  setTimeout(() => recentMessages.delete(messageId), DEDUP_TTL);
  return false;
}

// ── Commands ──
function handleCommand(message: Message): boolean {
  const content = message.content.trim();
  if (!content.startsWith("!모드")) return false;

  const args = content.split(/\s+/).slice(1);
  const sub = args[0];

  if (!sub || sub === "목록") {
    const presets = getPresets();
    const list = presets.map(p =>
      `${p.active ? "▸ " : "  "}**${p.name}** (\`!모드 ${p.id}\`)${p.active ? " ← 현재" : ""}`
    ).join("\n");
    message.reply(`**프리셋 목록**\n${list}`);
    return true;
  }

  const presets = getPresets();
  const found = presets.find(p => p.id === sub || p.name.includes(sub));

  if (!found) {
    message.reply(`\`${sub}\` 프리셋을 못 찾겠어. \`!모드 목록\`으로 확인해봐`);
    return true;
  }

  setActivePreset(found.id);
  message.reply(`프리셋 변경: **${found.name}**`);
  return true;
}

// ── AI Judge trigger ──
async function triggerJudge(channelId: string, message: Message, channelName: string, guildName: string): Promise<void> {
  console.log(`[JUDGE] channel=${channelName} msgId=${message.id} author=${message.author.displayName}`);
  const cleanContent = message.content.replace(/<@!?\d+>/g, "").trim();

  const startTime = Date.now();
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
      return judgeAndReply(channelHistory, ragContext, message.author.id);
    });

    const responseTime = Date.now() - startTime;

    if (!reply) {
      addLog({
        guild: guildName,
        channel: channelName,
        author: message.author.displayName,
        content: cleanContent,
        botReplied: false,
        triggerReason: "random",
        botReply: "<SKIP>",
        responseTime,
        ragHits: ragHitCount,
        error: null,
        model: lastUsedModel,
      });
      return;
    }

    markUserRequest(message.author.id);

    const resolvedReply = resolveMentions(reply, message);
    console.log(`[REPLY:JUDGE] msgId=${message.id} channel=${channelName} sending judge reply`);
    await message.reply(resolvedReply);
    history.addMessage(channelId, { role: "assistant", content: reply });
    state.stats.repliesSent++;
    trackUser(message.author.id, message.author.displayName, true);

    // Background: extract user info
    const extractHistory = history.getHistory(channelId).slice(-10);
    extractAndSave(message.author.displayName, extractHistory).catch(() => {});

    addLog({
      guild: guildName,
      channel: channelName,
      author: message.author.displayName,
      content: cleanContent,
      botReplied: true,
      triggerReason: "random",
      botReply: reply,
      responseTime,
      ragHits: ragHitCount,
      error: null,
      model: lastUsedModel,
    });
  } catch (err) {
    const isRateLimit = (err as Error).message?.includes("429") || (err as Error).message?.includes("quota");
    addError(isRateLimit ? "rate_limit" : "api_error", (err as Error).message, `channel: ${channelName}, guild: ${guildName}`);
  }
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
    if (handleCommand(message)) return;

    const channelId = message.channel.id;
    const guildName = message.guild?.name || "DM";
    const channelName = "name" in message.channel ? (message.channel as any).name as string : "unknown";
    const cleanContent = message.content.replace(/<@!?\d+>/g, "").trim();

    const imageData = await extractImage(message);

    const isMentioned = message.mentions.has(client.user!);
    console.log(`[MSG] id=${message.id} mention=${isMentioned} mode=${state.config.replyMode} channel=${channelName} author=${message.author.displayName} content="${cleanContent.slice(0, 30)}"`);
    const shouldLog = isMentioned || state.config.passiveLogging;

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

    // Mentioned → always reply. Otherwise → mode-based auto-participation.
    if (!isMentioned) {
      const mode = state.config.replyMode;

      // Mute mode → skip entirely
      if (mode === "mute" || isChannelMuted(channelId)) return;

      // Auto mode → 30s cooldown, then AI judges with full context
      if (mode === "auto") {
        // If timer already running, let it fire — don't reset
        if (autoCooldowns.has(channelId)) return;

        const timer = setTimeout(() => {
          autoCooldowns.delete(channelId);
          triggerJudge(channelId, message, channelName, guildName);
        }, AUTO_COOLDOWN_MS);
        autoCooldowns.set(channelId, timer);
        return;
      }

      // Interval mode → timer + message count trigger
      if (mode === "interval") {
        const intervalMs = state.config.judgeInterval * 1000;
        const threshold = state.config.judgeThreshold;
        const cs = judgeState.get(channelId);

        if (!cs) {
          const timer = setTimeout(() => {
            judgeState.delete(channelId);
            triggerJudge(channelId, message, channelName, guildName);
          }, intervalMs);
          judgeState.set(channelId, { timer, msgCount: 1 });
        } else {
          cs.msgCount++;
          if (cs.msgCount >= threshold) {
            clearTimeout(cs.timer);
            judgeState.delete(channelId);
            triggerJudge(channelId, message, channelName, guildName);
          }
        }
        return;
      }

      return;
    }

    // ── Mentioned: always reply ──
    console.log(`[MENTION] id=${message.id} channel=${channelName} author=${message.author.displayName}`);
    trackUser(message.author.id, message.author.displayName, true);
    markUserRequest(message.author.id);

    let waitingCancelled = false;
    let waitingMsgPromise: Promise<Message<boolean>> | null = null;

    const queueDelay = setTimeout(() => {
      if (waitingCancelled) return;
      waitingMsgPromise = message.reply("잠시 기다려달라냥... 0w0");
    }, 2000);

    async function sendReply(text: string): Promise<void> {
      clearTimeout(queueDelay);
      waitingCancelled = true;

      if (waitingMsgPromise) {
        // 대기 메시지가 전송 중이거나 완료됨 → 기다린 후 수정
        try {
          console.log(`[SEND] id=${message.id} awaiting waitingMsgPromise...`);
          const msg = await waitingMsgPromise;
          console.log(`[SEND] id=${message.id} editing waiting message`);
          await msg.edit(text);
          console.log(`[SEND] id=${message.id} edit done`);
        } catch (e) {
          console.error(`[SEND] id=${message.id} edit failed: ${(e as Error).message}, sending new reply`);
          await message.reply(text);
        }
      } else {
        console.log(`[SEND] id=${message.id} no waiting message, sending new reply`);
        await message.reply(text);
      }
    }

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

      if (!reply) {
        clearTimeout(queueDelay);
        waitingCancelled = true;
        if (waitingMsgPromise) {
          try { const msg = await waitingMsgPromise; await (msg as Message).delete(); } catch {}
        }
        return;
      }

      const resolved = resolveMentions(reply, message);
      console.log(`[MENTION:REPLY] id=${message.id} replySent=${replySent} reply="${resolved.slice(0, 50)}"`);
      await sendReply(resolved);
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
      // 이미 정상 응답을 보냈으면 에러 메시지 중복 전송 방지
      if (!replySent) {
        const errorMsg = isRateLimit
          ? "오늘은 너무 많이 떠들었다냥... 내일 다시 돌아온다냥! >w<"
          : "뭔가 고장났다냥... @д@";

        console.log(`[REPLY:ERROR] id=${message.id} sending error reply`);
        await sendReply(errorMsg).catch(() => {});
      } else {
        console.error(`[REPLY:POST_ERROR] id=${message.id} 응답 후 후처리 에러:`, (err as Error).message);
      }
    }
  });
}
