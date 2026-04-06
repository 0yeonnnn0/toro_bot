import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
  ButtonInteraction,
  REST,
  Routes,
  TextChannel,
  ChannelType,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ComponentType,
} from "discord.js";
import { getPresets, setActivePreset, getActivePresetId, getPreset } from "./prompt";
import { getReply } from "./ai";
import { state } from "../shared/state";
import { getQueueStats } from "./queue";
import { getStats as getRagStats } from "./rag";
import { generateImage, type ImageModel } from "./draw";
import { generateSpeech, VOICES, type VoiceName } from "./tts";
import { readUserNote, listUserNotes, getVaultStats } from "./vault";
import { playTrack, playTrackDirect, searchTracks, skip, stop as musicStop, pause, getQueue, getNowPlaying, removeTrack, setAutoplay, getAutoplay, triggerAutoplayNow, parseArtist, setVolume, getVolume, isPaused, type Track } from "./music";

// ── Command Definitions ──
export const commands = [
  new SlashCommandBuilder()
    .setName("help")
    .setDescription("TORO 사용 가이드"),

  new SlashCommandBuilder()
    .setName("mode")
    .setDescription("봇 프리셋 관리")
    .addSubcommand(sub =>
      sub.setName("list").setDescription("프리셋 목록 보기")
    )
    .addSubcommand(sub =>
      sub.setName("set").setDescription("프리셋 변경")
        .addStringOption(opt =>
          opt.setName("preset").setDescription("적용할 프리셋").setRequired(true).setAutocomplete(true)
        )
    )
    .addSubcommand(sub =>
      sub.setName("current").setDescription("현재 프리셋 확인")
    ),

  new SlashCommandBuilder()
    .setName("ask")
    .setDescription("봇에게 질문하기")
    .addStringOption(opt =>
      opt.setName("message").setDescription("메시지 내용").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("status")
    .setDescription("봇 상태 확인"),

  new SlashCommandBuilder()
    .setName("summary")
    .setDescription("최근 대화 AI 요약")
    .addIntegerOption(opt =>
      opt.setName("count").setDescription("요약할 메시지 수 (기본 50)").setMinValue(10).setMaxValue(100)
    ),

  new SlashCommandBuilder()
    .setName("draw")
    .setDescription("AI로 이미지 생성")
    .addStringOption(opt =>
      opt.setName("prompt").setDescription("그릴 내용").setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName("quality").setDescription("모델 품질")
        .addChoices(
          { name: "Flash (빠름)", value: "flash" },
          { name: "Pro (고품질)", value: "pro" },
        )
    ),

  new SlashCommandBuilder()
    .setName("say")
    .setDescription("봇이 음성으로 답변해줘 (TTS)")
    .addStringOption(opt =>
      opt.setName("message").setDescription("말할 내용").setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName("voice").setDescription("음성 선택")
        .addChoices(
          { name: "Kore (여성, 차분)", value: "kore" },
          { name: "Aoede (여성, 밝음)", value: "aoede" },
          { name: "Leda (여성, 따뜻)", value: "leda" },
          { name: "Puck (남성, 활발)", value: "puck" },
          { name: "Charon (남성, 낮음)", value: "charon" },
          { name: "Fenrir (남성, 부드러움)", value: "fenrir" },
        )
    ),

  new SlashCommandBuilder()
    .setName("내정보")
    .setDescription("봇이 기억하는 내 정보 확인")
    .addUserOption(opt =>
      opt.setName("user").setDescription("다른 유저 정보 확인 (선택)")
    ),

  new SlashCommandBuilder()
    .setName("mute")
    .setDescription("이 채널에서 봇 임시 정지/해제")
    .addIntegerOption(opt =>
      opt.setName("minutes").setDescription("정지 시간 (분, 기본 30분, 0이면 해제)").setMinValue(0).setMaxValue(1440)
    ),

  new SlashCommandBuilder()
    .setName("mute-status")
    .setDescription("이 채널의 음소거 남은 시간 확인"),

  new SlashCommandBuilder()
    .setName("reply")
    .setDescription("봇 응답 모드 변경")
    .addStringOption(opt =>
      opt.setName("mode").setDescription("응답 모드").setRequired(true)
        .addChoices(
          { name: "자동 (AI 판단)", value: "auto" },
          { name: "간격 (타이머/메시지 수)", value: "interval" },
          { name: "음소거", value: "mute" },
        )
    )
    .addIntegerOption(opt =>
      opt.setName("interval").setDescription("간격 모드: 타이머 (초, 기본 120)").setMinValue(10).setMaxValue(600)
    )
    .addIntegerOption(opt =>
      opt.setName("threshold").setDescription("간격 모드: 메시지 수 (기본 5)").setMinValue(1).setMaxValue(50)
    ),

  // ── Music ──
  new SlashCommandBuilder()
    .setName("play")
    .setDescription("유튜브 음악 재생")
    .addStringOption(opt =>
      opt.setName("query").setDescription("검색어 또는 유튜브 URL").setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName("skip")
    .setDescription("현재 곡 스킵"),

  new SlashCommandBuilder()
    .setName("stop")
    .setDescription("음악 정지 + 퇴장"),

  new SlashCommandBuilder()
    .setName("pause")
    .setDescription("일시정지 / 재개"),

  new SlashCommandBuilder()
    .setName("queue")
    .setDescription("대기열 보기"),

  new SlashCommandBuilder()
    .setName("nowplaying")
    .setDescription("현재 재생 중인 곡"),

  new SlashCommandBuilder()
    .setName("volume")
    .setDescription("볼륨 조절 (0~100)")
    .addIntegerOption(opt =>
      opt.setName("level").setDescription("볼륨 (0~100, 기본 50)").setMinValue(0).setMaxValue(100)
    ),

  new SlashCommandBuilder()
    .setName("autoplay")
    .setDescription("자동 추천 재생 (장르 지정 가능)")
    .addStringOption(opt =>
      opt.setName("genre").setDescription("장르 (예: kpop, lofi, jazz, rock) 또는 off")
        .addChoices(
          { name: "끄기", value: "off" },
          { name: "K-Pop", value: "kpop" },
          { name: "Pop", value: "pop" },
          { name: "Hip-Hop", value: "hiphop" },
          { name: "R&B", value: "rnb" },
          { name: "Rock", value: "rock" },
          { name: "Jazz", value: "jazz" },
          { name: "Lofi", value: "lofi" },
          { name: "EDM", value: "edm" },
          { name: "Classical", value: "classical" },
          { name: "아티스트 기반 (기본)", value: "artist" },
        )
    ),

  new SlashCommandBuilder()
    .setName("remove")
    .setDescription("대기열에서 곡 제거")
    .addIntegerOption(opt =>
      opt.setName("번호").setDescription("제거할 곡 번호 (/queue에서 확인)").setRequired(true).setMinValue(1)
    ),
];

// ── Register Commands ──
export async function registerCommands(clientId: string, token: string): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(token);
  try {
    console.log("슬래시 커맨드 등록 중...");
    await rest.put(Routes.applicationCommands(clientId), {
      body: commands.map(c => c.toJSON()),
    });
    console.log("슬래시 커맨드 등록 완료");
  } catch (err) {
    console.error("슬래시 커맨드 등록 실패:", (err as Error).message);
  }
}

// ── Handle Interactions ──
export async function handleInteraction(interaction: ChatInputCommandInteraction): Promise<void> {
  const { commandName } = interaction;

  switch (commandName) {
    case "help":
      await handleHelp(interaction);
      break;
    case "mode":
      await handleMode(interaction);
      break;
    case "ask":
      await handleQuestion(interaction);
      break;
    case "status":
      await handleStatus(interaction);
      break;
    case "summary":
      await handleSummary(interaction);
      break;
    case "draw":
      await handleDraw(interaction);
      break;
    case "say":
      await handleSay(interaction);
      break;
    case "내정보":
      await handleMyInfo(interaction);
      break;
    case "mute":
      await handleMute(interaction);
      break;
    case "mute-status":
      await handleMuteStatus(interaction);
      break;
    case "reply":
      await handleReply(interaction);
      break;
    case "play":
      await handlePlay(interaction);
      break;
    case "skip":
      await handleSkip(interaction);
      break;
    case "stop":
      await handleStop(interaction);
      break;
    case "pause":
      await handlePause(interaction);
      break;
    case "queue":
      await handleQueue(interaction);
      break;
    case "nowplaying":
      await handleNowPlaying(interaction);
      break;
    case "remove":
      await handleRemove(interaction);
      break;
    case "volume":
      await handleVolume(interaction);
      break;
    case "autoplay":
      await handleAutoplay(interaction);
      break;
  }
}

// ── /help ──
async function handleHelp(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = {
    color: 0x3182f6,
    title: "🐱 TORO 사용 가이드",
    fields: [
      {
        name: "💬 대화",
        value: [
          "`@TORO` — 멘션하면 답변",
          "`/summary` — 최근 대화 요약",
          "`/mode` — 성격 프리셋 변경",
        ].join("\n"),
      },
      {
        name: "🎵 음악",
        value: [
          "`/play` — 유튜브 음악 검색/재생",
          "`/skip` · `/stop` · `/pause` — 재생 컨트롤",
          "`/queue` · `/remove` — 대기열 관리",
          "`/nowplaying` — 현재 곡 정보",
          "`/volume` — 볼륨 조절",
          "`/autoplay` — 자동 추천 재생 (장르 선택)",
        ].join("\n"),
      },
      {
        name: "🎨 생성",
        value: [
          "`/draw` — AI 이미지 생성",
          "`/say` — 음성으로 답변 (TTS)",
        ].join("\n"),
      },
      {
        name: "🧠 기억",
        value: "`/내정보` — 봇이 기억하는 내 정보 확인",
      },
      {
        name: "⚙️ 설정",
        value: [
          "`/reply` — 응답 모드 변경",
          "`/mute` — 채널 음소거",
          "`/status` — 봇 상태 확인",
        ].join("\n"),
      },
    ],
  };

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// ── /모드 ──
async function handleMode(interaction: ChatInputCommandInteraction): Promise<void> {
  const sub = interaction.options.getSubcommand();

  if (sub === "list") {
    const presets = getPresets(true);
    const list = presets.map(p =>
      `${p.active ? "▸ " : "　"}**${p.name}**${p.active ? " ← current" : ""}\n　　\`/mode set preset:${p.id}\``
    ).join("\n");
    await interaction.reply({ content: `**프리셋**\n\n${list}`, ephemeral: true });
    return;
  }

  if (sub === "current") {
    const id = getActivePresetId();
    const preset = getPreset(id);
    await interaction.reply({
      content: `Current preset: **${preset?.name || id}**\n\`${id}\``,
      ephemeral: true,
    });
    return;
  }

  if (sub === "set") {
    const presetId = interaction.options.getString("preset", true);
    const presets = getPresets();
    const found = presets.find(p => p.id === presetId || p.name.includes(presetId));

    if (!found) {
      await interaction.reply({ content: `\`${presetId}\` 프리셋을 찾을 수 없어`, ephemeral: true });
      return;
    }

    setActivePreset(found.id);
    await interaction.reply(`프리셋 변경됨: **${found.name}**`);
  }
}

// ── /질문 ──
async function handleQuestion(interaction: ChatInputCommandInteraction): Promise<void> {
  const message = interaction.options.getString("message", true);
  await interaction.deferReply();

  try {
    const history = [{ role: "user" as const, content: `${interaction.user.displayName}: ${message}` }];
    const reply = await getReply(history, "", interaction.user.id);
    await interaction.editReply(reply);
  } catch (err) {
    const isRateLimit = (err as Error).message?.includes("429") || (err as Error).message?.includes("quota");
    await interaction.editReply(
      isRateLimit
        ? "오늘은 너무 많이 떠들었다냥... 내일 다시 돌아온다냥! >w<"
        : "뭔가 고장났다냥... @д@"
    );
  }
}

// ── /상태 ──
async function handleStatus(interaction: ChatInputCommandInteraction): Promise<void> {
  const uptime = Date.now() - state.stats.startedAt;
  const h = Math.floor(uptime / 3600000);
  const m = Math.floor((uptime % 3600000) / 60000);
  const queue = getQueueStats();
  const rag = await getRagStats();
  const presetId = getActivePresetId();
  const preset = getPreset(presetId);

  const embed = {
    color: 0x6c8aff,
    title: "TORO Bot Status",
    fields: [
      { name: "Uptime", value: `${h}h ${m}m`, inline: true },
      { name: "Messages", value: `${state.stats.messagesProcessed}`, inline: true },
      { name: "Replies", value: `${state.stats.repliesSent}`, inline: true },
      { name: "Reply Mode", value: state.config.replyMode === "auto" ? "자동 (AI 판단)" : state.config.replyMode === "interval" ? `간격 (${state.config.judgeInterval}초/${state.config.judgeThreshold}개)` : "음소거", inline: true },
      { name: "Model", value: state.config.model, inline: true },
      { name: "Preset", value: preset?.name || presetId, inline: true },
      { name: "Queue", value: `${queue.activeCount}/${queue.maxConcurrent} active`, inline: true },
      { name: "RAG Vectors", value: `${rag.vectorCount}`, inline: true },
      { name: "Vault Notes", value: `${getVaultStats().userNotes}`, inline: true },
    ],
  };

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// ── /summary ──
async function handleSummary(interaction: ChatInputCommandInteraction): Promise<void> {
  const count = interaction.options.getInteger("count") || 50;
  const channel = interaction.channel;

  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: "텍스트 채널에서만 사용 가능해", ephemeral: true });
    return;
  }

  await interaction.deferReply();

  try {
    const messages = await (channel as TextChannel).messages.fetch({ limit: count });
    const sorted = [...messages.values()]
      .filter(m => !m.author.bot)
      .reverse();

    if (sorted.length === 0) {
      await interaction.editReply("요약할 메시지가 없어");
      return;
    }

    const chatLog = sorted.map(m =>
      `${m.author.displayName}: ${m.content}`
    ).join("\n");

    const summaryPrompt = `아래 디스코드 채팅 내용을 한국어로 요약해줘.
주요 주제별로 정리하고, 누가 뭘 말했는지 간략히 포함해.
3~5개 항목으로 정리해. 이모지 쓰지 마.

---
${chatLog}`;

    const history = [{ role: "user" as const, content: summaryPrompt }];
    const reply = await getReply(history, "", interaction.user.id);

    const embed = {
      color: 0x6c8aff,
      title: `💬 최근 ${sorted.length}개 메시지 요약`,
      description: reply,
      footer: { text: `#${(channel as TextChannel).name}` },
      timestamp: new Date().toISOString(),
    };

    await interaction.editReply({ embeds: [embed] });
  } catch (err) {
    await interaction.editReply("요약하다가 고장났다냥... @д@ " + (err as Error).message);
  }
}

// ── /draw ──
async function handleDraw(interaction: ChatInputCommandInteraction): Promise<void> {
  const prompt = interaction.options.getString("prompt", true);
  const quality = (interaction.options.getString("quality") || "flash") as ImageModel;
  await interaction.deferReply();

  try {
    const result = await generateImage(prompt, quality);
    if (result) {
      const label = result.usedModel !== quality ? ` (${result.usedModel} fallback)` : "";
      await interaction.editReply({
        content: `**${prompt}**${label}`,
        files: [result.attachment],
      });
    } else {
      await interaction.editReply("이미지 생성에 실패했다냥... 다른 프롬프트로 다시 해보라냥 @д@");
    }
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("429") || msg.includes("quota")) {
      await interaction.editReply("오늘은 그림을 너무 많이 그렸다냥... 내일 다시 오라냥! >w<");
    } else {
      await interaction.editReply("그림 그리다 뭔가 고장났다냥... @д@\n" + msg);
    }
  }
}

// ── /say ──
async function handleSay(interaction: ChatInputCommandInteraction): Promise<void> {
  const message = interaction.options.getString("message", true);
  const explicitVoice = interaction.options.getString("voice");
  // Use preset's default voice if user didn't pick one
  const presetVoice = getPreset(getActivePresetId())?.voice || "kore";
  const voice = (explicitVoice || presetVoice) as VoiceName;
  await interaction.deferReply();

  try {
    // First get AI reply in character, then TTS it
    const h = [{ role: "user" as const, content: `${interaction.user.displayName}: ${message}` }];
    const textReply = await getReply(h, "", interaction.user.id);

    const attachment = await generateSpeech(textReply, voice);
    if (attachment) {
      await interaction.editReply({
        content: textReply,
        files: [attachment],
      });
    } else {
      await interaction.editReply(textReply + "\n\n*목소리가 안 나온다냥... @д@*");
    }
  } catch (err) {
    const msg = (err as Error).message;
    if (msg.includes("429") || msg.includes("quota")) {
      await interaction.editReply("오늘은 목이 너무 아프다냥... 내일 다시 말해준다냥! >w<");
    } else {
      await interaction.editReply("목소리 내다가 고장났다냥... @д@ " + msg);
    }
  }
}

// ── /내정보 ──
async function handleMyInfo(interaction: ChatInputCommandInteraction): Promise<void> {
  const target = interaction.options.getUser("user") || interaction.user;
  const note = readUserNote(target.displayName);

  if (!note) {
    await interaction.reply({
      content: `**${target.displayName}**에 대한 기록이 아직 없어`,
      ephemeral: true,
    });
    return;
  }

  // Strip frontmatter for display
  const display = note.replace(/^---[\s\S]*?---\n*/, "").trim();
  const truncated = display.length > 1800 ? display.slice(0, 1800) + "\n..." : display;

  const embed = {
    color: 0x6c8aff,
    title: `📋 ${target.displayName}`,
    description: truncated,
    footer: { text: "TORO Vault" },
    timestamp: new Date().toISOString(),
  };

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// ── /reply ──
async function handleReply(interaction: ChatInputCommandInteraction): Promise<void> {
  const mode = interaction.options.getString("mode", true) as "auto" | "interval" | "mute";
  const interval = interaction.options.getInteger("interval");
  const threshold = interaction.options.getInteger("threshold");

  state.config.replyMode = mode;
  if (interval !== null) state.config.judgeInterval = interval;
  if (threshold !== null) state.config.judgeThreshold = threshold;

  const labels: Record<string, string> = {
    auto: "자동 (AI 판단)",
    interval: `간격 (${state.config.judgeInterval}초 / ${state.config.judgeThreshold}개)`,
    mute: "음소거",
  };

  await interaction.reply(`응답 모드 변경: **${labels[mode]}**`);
}

// ── /mute ──
// channelId → unmute timestamp
export const mutedChannels = new Map<string, number>();

async function handleMute(interaction: ChatInputCommandInteraction): Promise<void> {
  const channelId = interaction.channelId;
  const minutes = interaction.options.getInteger("minutes") ?? 30;

  if (minutes === 0) {
    mutedChannels.delete(channelId);
    await interaction.reply("음소거 해제다냥! 다시 떠들어준다냥 >w<");
    return;
  }

  const until = Date.now() + minutes * 60 * 1000;
  mutedChannels.set(channelId, until);
  await interaction.reply(`${minutes}분간 입 다물고 있겠다냥... \`/mute 0\` 하면 다시 말해준다냥 0w0`);
}

async function handleMuteStatus(interaction: ChatInputCommandInteraction): Promise<void> {
  const until = mutedChannels.get(interaction.channelId);
  if (!until || Date.now() > until) {
    mutedChannels.delete(interaction.channelId);
    await interaction.reply("이 채널은 음소거 상태가 아니다냥! 0w0");
    return;
  }
  const remainMs = until - Date.now();
  const mins = Math.ceil(remainMs / 60000);
  await interaction.reply(`이 채널은 아직 **${mins}분** 남았다냥... \`/mute 0\` 하면 바로 해제된다냥!`);
}

export function isChannelMuted(channelId: string): boolean {
  const until = mutedChannels.get(channelId);
  if (!until) return false;
  if (Date.now() > until) {
    mutedChannels.delete(channelId);
    return false;
  }
  return true;
}

// ── /play ──
const SEARCH_PER_PAGE = 5;
const SEARCH_TOTAL = 15; // 최대 3페이지

async function handlePlay(interaction: ChatInputCommandInteraction): Promise<void> {
  const query = interaction.options.getString("query", true);
  const member = interaction.guild?.members.cache.get(interaction.user.id);
  const voiceChannel = member?.voice.channel;

  if (!voiceChannel) {
    await interaction.reply({ content: "먼저 음성 채널에 들어가", ephemeral: true });
    return;
  }



  await interaction.deferReply({ flags: ['Ephemeral'] });

  try {
    // URL 직접 입력이면 바로 재생
    if (query.includes("youtube.com/") || query.includes("youtu.be/")) {
      const results = await searchTracks(query, interaction.user.displayName, 1);
      if (results.length === 0) {
        await interaction.editReply("URL을 찾을 수 없어");
        return;
      }
      const position = await playTrackDirect(voiceChannel, results[0]);
      await interaction.editReply({ embeds: [makePlayEmbed(results[0], position)], components: [buildControllerButtons(false)] });
      return;
    }

    const allResults = await searchTracks(query, interaction.user.displayName, SEARCH_TOTAL);

    if (allResults.length === 0) {
      await interaction.editReply("검색 결과가 없다냥... @д@");
      return;
    }

    let page = 0;
    await showSearchPage(interaction, voiceChannel, query, allResults, page);
  } catch (err) {
    await interaction.editReply(`에러 발생... @д@ ${(err as Error).message}`);
  }
}

async function showSearchPage(
  interaction: ChatInputCommandInteraction,
  voiceChannel: any,
  query: string,
  allResults: Track[],
  page: number,
): Promise<void> {
  const start = page * SEARCH_PER_PAGE;
  const pageResults = allResults.slice(start, start + SEARCH_PER_PAGE);
  const hasMore = start + SEARCH_PER_PAGE < allResults.length;

  const list = pageResults.map((t, i) =>
    `**${start + i + 1}.** [${t.title}](${t.url}) (${t.duration})`
  ).join("\n");

  const embed = {
    color: 0x3182f6,
    title: `"${query}" 검색 결과`,
    description: list,
    footer: { text: `${page + 1}/${Math.ceil(allResults.length / SEARCH_PER_PAGE)} 페이지 • 30초 안에 선택해줘` },
  };

  // 줄 1: 번호 버튼
  const numButtons = pageResults.map((_, i) =>
    new ButtonBuilder()
      .setCustomId(`play_${start + i}`)
      .setLabel(`${start + i + 1}`)
      .setStyle(ButtonStyle.Primary)
  );
  const row1 = new ActionRowBuilder<ButtonBuilder>().addComponents(numButtons);

  // 줄 2: 더 보기 + URL 입력
  const row2Buttons: ButtonBuilder[] = [];
  if (hasMore) {
    row2Buttons.push(
      new ButtonBuilder()
        .setCustomId("play_more")
        .setLabel("더 보기")
        .setStyle(ButtonStyle.Secondary)
    );
  }
  row2Buttons.push(
    new ButtonBuilder()
      .setCustomId("play_url")
      .setLabel("URL 입력")
      .setStyle(ButtonStyle.Secondary)
  );
  const row2 = new ActionRowBuilder<ButtonBuilder>().addComponents(row2Buttons);

  const msg = await interaction.editReply({ embeds: [embed], components: [row1, row2] });

  try {
    const btnInteraction = await msg.awaitMessageComponent({
      componentType: ComponentType.Button,
      filter: (i) => i.user.id === interaction.user.id,
      time: 30000,
    });

    if (btnInteraction.customId === "play_more") {
      await btnInteraction.deferUpdate();
      await showSearchPage(interaction, voiceChannel, query, allResults, page + 1);

    } else if (btnInteraction.customId === "play_url") {
      const modal = new ModalBuilder()
        .setCustomId("play_url_modal")
        .setTitle("유튜브 URL 입력")
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId("url_input")
              .setLabel("유튜브 URL")
              .setPlaceholder("https://youtube.com/watch?v=...")
              .setStyle(TextInputStyle.Short)
              .setRequired(true)
          )
        );

      await btnInteraction.showModal(modal);

      try {
        const modalInteraction = await btnInteraction.awaitModalSubmit({ time: 60000 });
        const url = modalInteraction.fields.getTextInputValue("url_input");
        const tracks = await searchTracks(url, interaction.user.displayName, 1);

        if (tracks.length === 0) {
          await modalInteraction.reply({ content: "URL을 찾을 수 없어", ephemeral: true });
          await interaction.editReply({ embeds: [embed], components: [] });
          return;
        }

        const position = await playTrackDirect(voiceChannel, tracks[0]);
        await modalInteraction.reply({ embeds: [makePlayEmbed(tracks[0], position)], components: [buildControllerButtons(false)] });
        await interaction.editReply({ embeds: [embed], components: [] });
      } catch {
        await interaction.editReply({ embeds: [embed], components: [] });
      }

    } else {
      // 번호 선택
      const idx = parseInt(btnInteraction.customId.split("_")[1]);
      const track = allResults[idx];
      const position = await playTrackDirect(voiceChannel, track);

      await btnInteraction.update({ content: "선택 완료", embeds: [], components: [] });
      await interaction.followUp({ embeds: [makePlayEmbed(track, position)], components: [buildControllerButtons(false)] });
    }
  } catch {
    await interaction.editReply({ embeds: [embed], components: [] }).catch(() => {});
  }
}

function makePlayEmbed(track: Track, position: number) {
  const artist = parseArtist(track.title);
  const fields = [];
  if (artist) fields.push({ name: "아티스트", value: artist, inline: true });
  fields.push({ name: "길이", value: track.duration, inline: true });
  fields.push({ name: "요청", value: track.requestedBy, inline: true });

  return {
    color: 0x3182f6,
    title: position === 1 ? "Now Playing" : `#${position} 대기열 추가`,
    description: `**[${track.title}](${track.url})**`,
    fields,
    thumbnail: track.thumbnail ? { url: track.thumbnail } : undefined,
  };
}

// ── /skip ──
async function handleSkip(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) return;


  const skipped = skip(guildId);
  if (skipped) {
    await interaction.reply(`**${skipped.title}** 스킵!`);
  } else {
    await interaction.reply({ content: "재생 중인 곡이 없어", ephemeral: true });
  }
}

// ── /stop ──
async function handleStop(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) return;


  musicStop(guildId);
  await interaction.reply("음악 정지! 나간다냥 >w<");
}

// ── /pause ──
async function handlePause(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) return;


  const paused = pause(guildId);
  await interaction.reply(paused ? "일시정지 ⏸️" : "재개 ▶️");
}

// ── /queue ──
async function handleQueue(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) return;

  const tracks = getQueue(guildId);
  if (tracks.length === 0) {
    await interaction.reply({ content: "대기열이 비어있어", ephemeral: true });
    return;
  }

  const list = tracks.map((t, i) => {
    const artist = parseArtist(t.title);
    const artistLabel = artist ? ` — ${artist}` : "";
    return `${i === 0 ? "▸ " : `${i}. `}**${t.title}** (${t.duration})${artistLabel} | ${t.requestedBy}`;
  }).join("\n");

  const embed = {
    color: 0x3182f6,
    title: `대기열 (${tracks.length}곡)`,
    description: list.slice(0, 2000),
  };

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

// ── /nowplaying ──
async function handleNowPlaying(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) return;

  const track = getNowPlaying(guildId);
  if (!track) {
    await interaction.reply({ content: "재생 중인 곡이 없어", ephemeral: true });
    return;
  }

  const paused = isPaused(guildId);
  const queue = getQueue(guildId);
  const embed = buildControllerEmbed(track, paused, queue);
  const row = buildControllerButtons(paused);

  await interaction.reply({ embeds: [embed], components: [row] });
}

// ── /volume ──
async function handleVolume(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) return;

  const level = interaction.options.getInteger("level");

  if (level === null) {
    await interaction.reply(`현재 볼륨: **${getVolume(guildId)}%**`);
    return;
  }

  const result = setVolume(guildId, level / 100);
  await interaction.reply(`볼륨: **${result}%** — 다음 곡부터 적용`);
}

// ── /autoplay ──
async function handleAutoplay(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) return;

  const genre = interaction.options.getString("genre");

  if (genre === "off") {
    setAutoplay(guildId, "off");
    await interaction.reply({ content: "자동 추천 재생 **꺼짐**", ephemeral: true });
    return;
  }

  const genreValue = genre === "artist" ? null : (genre || null);
  const wasAutoplay = getAutoplay(guildId);
  const enabled = setAutoplay(guildId, genreValue);

  if (enabled) {
    const label = genreValue ? `**${genreValue}** 장르` : "**현재 곡 기반**";
    const action = wasAutoplay.enabled ? "변경" : "켜짐";
    await interaction.reply({ content: `자동 추천 재생 **${action}** (${label}) — 추천곡 추가 중...`, ephemeral: true });
    triggerAutoplayNow(interaction.guildId!).catch(() => {});
  } else if (genreValue) {
    // 큐 없음 + 장르 지정 → 해당 장르로 첫 곡 검색 후 바로 재생
    const member = interaction.guild?.members.cache.get(interaction.user.id);
    const voiceChannel = member?.voice.channel;
    if (!voiceChannel) {
      await interaction.reply({ content: "먼저 음성 채널에 들어가", ephemeral: true });
      return;
    }
    await interaction.deferReply();
    const tracks = await searchTracks(`${genreValue} music`, interaction.user.displayName, 1);
    if (tracks.length === 0) {
      await interaction.editReply("검색 결과가 없어...");
      return;
    }
    await playTrackDirect(voiceChannel, tracks[0]);
    setAutoplay(guildId, genreValue);
    triggerAutoplayNow(guildId).catch(() => {});
    await interaction.editReply(`**${genreValue}** 자동 재생 시작!`);
  } else {
    await interaction.reply({ content: "먼저 음악을 재생해줘", ephemeral: true });
  }
}

// ── /remove ──
async function handleRemove(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) return;

  const index = interaction.options.getInteger("번호", true);
  const removed = removeTrack(guildId, index);

  if (removed) {
    await interaction.reply(`**${removed.title}** 대기열에서 제거`);
  } else {
    await interaction.reply({ content: `${index}번 곡을 찾을 수 없어. \`/queue\`로 확인해봐`, ephemeral: true });
  }
}

// ── Music Controller (미디어 플레이어 UI) ──

// ── Music Controller ──

function buildControllerEmbed(track: Track, paused: boolean, queue: Track[]) {
  const artist = parseArtist(track.title);
  const queueCount = queue.length - 1; // 현재 곡 제외
  const next = queue[1];

  const fields = [];
  if (artist) fields.push({ name: "아티스트", value: artist, inline: true });
  fields.push({ name: "길이", value: track.duration, inline: true });
  fields.push({ name: "요청", value: track.requestedBy, inline: true });
  if (next) {
    const nextArtist = parseArtist(next.title);
    fields.push({ name: "다음 곡", value: `${next.title}${nextArtist ? ` — ${nextArtist}` : ""}`, inline: false });
  }
  if (queueCount > 1) {
    fields.push({ name: "대기열", value: `${queueCount}곡`, inline: true });
  }

  return {
    color: paused ? 0x999999 : 0x3182f6,
    title: paused ? "Paused" : "Now Playing",
    description: `**[${track.title}](${track.url})**`,
    fields,
    thumbnail: track.thumbnail ? { url: track.thumbnail } : undefined,
  };
}

function buildControllerButtons(paused: boolean) {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId("music_prev")
      .setLabel("◁◁")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("music_pause")
      .setLabel(paused ? "▶" : "❚❚")
      .setStyle(paused ? ButtonStyle.Success : ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId("music_stop")
      .setLabel("■")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("music_skip")
      .setLabel("▷▷")
      .setStyle(ButtonStyle.Secondary),
  );
}

// 버튼 인터랙션 핸들러
export async function handleMusicButton(interaction: ButtonInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) return;

  const current = getNowPlaying(guildId);

  switch (interaction.customId) {
    case "music_pause": {
      const paused = pause(guildId);
      await interaction.deferUpdate();
      // 버튼 상태 즉시 업데이트
      if (current) {
        const queue = getQueue(guildId);
        const embed = buildControllerEmbed(current, paused, queue);
        const row = buildControllerButtons(paused);
        await interaction.editReply({ embeds: [embed], components: [row] });
      }
      break;
    }
    case "music_skip": {
      const skipped = skip(guildId);
      if (skipped) {
        await interaction.reply({ content: `**${skipped.title}** 스킵!`, ephemeral: true });
      } else {
        await interaction.reply({ content: "스킵할 곡이 없어", ephemeral: true });
      }
      break;
    }
    case "music_stop": {
      musicStop(guildId);
      await interaction.reply({ content: "음악 정지! 나간다냥 >w<", ephemeral: true });
      break;
    }
    case "music_prev": {
      // 이전 곡 기능은 히스토리가 없어서 현재 곡 처음부터 다시 재생
      await interaction.reply({ content: "이전 곡 기능은 아직 없어... 현재 곡을 다시 들으려면 `/play`로 같은 곡을 검색해줘", ephemeral: true });
      break;
    }
  }
}


// ── Autocomplete ──
export async function handleAutocomplete(interaction: any): Promise<void> {
  const focused = interaction.options.getFocused(true);

  if (focused.name === "preset") {
    const presets = getPresets(true);
    const filtered = presets.filter(p =>
      p.id.includes(focused.value) || p.name.includes(focused.value)
    );
    await interaction.respond(
      filtered.slice(0, 25).map(p => ({
        name: `${p.name}${p.active ? " (현재)" : ""}`,
        value: p.id,
      }))
    );
  }
}
