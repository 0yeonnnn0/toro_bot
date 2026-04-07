import { Client, GatewayIntentBits, Message, ChatInputCommandInteraction, ActivityType } from "discord.js";
import { getReply } from "./ai";
import { state, addEvent, addError } from "../shared/state";
import { registerCommands, handleInteraction, handleAutocomplete, handleMusicButton } from "./commands";
import { stop as musicStop, setActivityCallback } from "./music";
import { setupMessageHandler } from "./message-handler";

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

  // 음악 재생 상태 → Discord activity 연결
  setActivityCallback((title) => {
    if (title) client.user?.setActivity(title, { type: ActivityType.Listening });
    else client.user?.setActivity(undefined as any);
  });

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
  if (interaction.isButton() && interaction.customId.startsWith("music_")) {
    await handleMusicButton(interaction);
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

// 메시지 핸들러 등록
setupMessageHandler(client);

// ── DEBUG: 모든 봇 메시지 전송 추적 ──
client.on("messageCreate", (msg) => {
  if (msg.author.id === client.user?.id) {
    const ref = msg.reference?.messageId || "none";
    console.log(`[BOT:SENT] content="${msg.content.slice(0, 60)}" replyTo=${ref} channel=${(msg.channel as any).name || msg.channel.id}`);
  }
});

export async function start(): Promise<void> {
  addEvent("bot_start", "봇 프로세스 시작");
  await client.login(process.env.DISCORD_TOKEN);
}
