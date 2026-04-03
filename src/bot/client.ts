import { Client, GatewayIntentBits, Message, ChatInputCommandInteraction } from "discord.js";
import { getReply, judgeAndReply, lastUsedModel } from "./ai";
import * as history from "./history";
import * as rag from "./rag";
import { state, addLog, addEvent, addError, trackUser, trackKeywords } from "../shared/state";
import { enqueue, canUserRequest, markUserRequest } from "./queue";
import { getPresets, setActivePreset, getActivePresetId } from "./prompt";
import { registerCommands, handleInteraction, handleAutocomplete, isChannelMuted } from "./commands";
import { fetchUrlContext } from "./scrape";
import { getUserContext, extractAndSave } from "./vault";
import { stop as musicStop } from "./music";
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

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
  ],
});

// ── Events ──
client.once("ready", async () => {
  console.log(`봇 로그인 완료: ${client.user!.tag}`);
  addEvent("bot_ready", `${client.user!.tag} — ${client.guilds.cache.size}개 서버`);

  // 슬래시 커맨드 등록
  await registerCommands(client.user!.id, process.env.DISCORD_TOKEN || "");
});

// 슬래시 커맨드 핸들러
client.on("interactionCreate", async (interaction) => {
  if (interaction.isAutocomplete()) {
    await handleAutocomplete(interaction);
    return;
  }
  if (interaction.isChatInputCommand()) {
    await handleInteraction(interaction as ChatInputCommandInteraction);
    return;
  }
});

client.on("guildCreate", (guild) => addEvent("guild_join", `${guild.name} (${guild.memberCount}명)`));

// ── 음성 채널: 유저 전부 나가면 봇도 퇴장 ──
client.on("voiceStateUpdate", (oldState, newState) => {
  // 유저가 채널에서 나갔을 때만 체크
  if (!oldState.channel || oldState.channelId === newState.channelId) return;
  const channel = oldState.channel;
  // 봇 제외하고 남은 멤버가 0명이면 퇴장
  const members = channel.members.filter(m => !m.user.bot);
  if (members.size === 0 && channel.guild) {
    musicStop(channel.guild.id);
  }
});

// ── 환영 메시지 ──
client.on("guildMemberAdd", async (member) => {
  addEvent("member_join", `${member.user.tag} → ${member.guild.name}`);

  // 시스템 채널 (서버 설정에서 지정한 환영 채널)
  const channel = member.guild.systemChannel;
  if (!channel) return;

  try {
    const history = [{
      role: "user" as const,
      content: `새로운 멤버 "${member.user.displayName}"이(가) 서버에 들어왔어. 환영 인사를 해줘. 짧게.`,
    }];
    const reply = await getReply(history, "", "");
    await channel.send(`${member} ${reply}\n와타시쟝은 TORO다냥!\nTORO에 대해 궁금하다면 \`/help\` 로 확인해라냥!`);
  } catch {
    await channel.send(`${member} 어서오라냥! >w<\n와타시쟝은 TORO다냥!\nTORO에 대해 궁금하다면 \`/help\` 로 확인해라냥!`).catch(() => {});
  }
});
client.on("guildDelete", (guild) => addEvent("guild_leave", guild.name));
client.on("error", (err) => addError("discord", err.message));
client.on("warn", (msg) => addEvent("discord_warn", msg));

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
  const cleanContent = message.content.replace(/<@!?\d+>/g, "").trim();

  const startTime = Date.now();
  try {
    let ragHitCount = 0;
    const reply = await enqueue(async () => {
      const channelHistory = history.getHistory(channelId);
      const ragResults = await rag.searchRelevant(cleanContent);
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

// ── Message handler ──
client.on("messageCreate", async (message: Message) => {
  if (message.author.bot) return;
  if (handleCommand(message)) return;

  const channelId = message.channel.id;
  const guildName = message.guild?.name || "DM";
  const channelName = "name" in message.channel ? (message.channel as any).name as string : "unknown";
  const cleanContent = message.content.replace(/<@!?\d+>/g, "").trim();

  const imageData = await extractImage(message);

  const isMentioned = message.mentions.has(client.user!);
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
  trackUser(message.author.id, message.author.displayName, true);
  markUserRequest(message.author.id);

  let waitingMsg: Message<boolean> | null = null;
  let waitingCancelled = false;
  let waitingSending = false;

  const queueDelay = setTimeout(async () => {
    if (waitingCancelled) return;
    waitingSending = true;
    try {
      const msg = await message.reply("잠시 기다려달라냥... 0w0");
      if (waitingCancelled) {
        await msg.delete().catch(() => {});
      } else {
        waitingMsg = msg;
      }
    } catch {}
    waitingSending = false;
  }, 2000);

  async function sendReply(text: string): Promise<void> {
    clearTimeout(queueDelay);
    waitingCancelled = true;
    if (waitingSending) await new Promise(r => setTimeout(r, 500));
    if (waitingMsg) {
      await waitingMsg.edit(text);
    } else {
      await message.reply(text);
    }
  }

  const startTime = Date.now();

  try {
    let ragHitCount = 0;
    const reply = await enqueue(async () => {
      const channelHistory = history.getHistory(channelId);
      const ragResults = await rag.searchRelevant(cleanContent);
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
      if (waitingMsg) await (waitingMsg as Message).delete().catch(() => {});
      return;
    }

    const resolved = resolveMentions(reply, message);
    await sendReply(resolved);
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

    await sendReply("뭔가 고장났다냥... @д@").catch(() => {});
  }
});

export async function start(): Promise<void> {
  addEvent("bot_start", "봇 프로세스 시작");
  await client.login(process.env.DISCORD_TOKEN);
}
