import {
  SlashCommandBuilder,
  ChatInputCommandInteraction,
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
import { playTrack, playTrackDirect, searchTracks, skip, stop as musicStop, pause, getQueue, getNowPlaying, removeTrack, type Track } from "./music";

// ── Command Definitions ──
export const commands = [
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
  }
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
      await interaction.editReply("그림 그리다가 뭔가 고장났다냥... @д@ " + msg);
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
async function handlePlay(interaction: ChatInputCommandInteraction): Promise<void> {
  const query = interaction.options.getString("query", true);
  const member = interaction.guild?.members.cache.get(interaction.user.id);
  const voiceChannel = member?.voice.channel;

  if (!voiceChannel) {
    await interaction.reply({ content: "먼저 음성 채널에 들어가", ephemeral: true });
    return;
  }

  await interaction.deferReply();

  try {
    const results = await searchTracks(query, interaction.user.displayName, 4);

    if (results.length === 0) {
      await interaction.editReply("검색 결과가 없다냥... @д@");
      return;
    }

    // URL 직접 입력이면 바로 재생
    if (results.length === 1 && query.includes("youtube.com/") || query.includes("youtu.be/")) {
      const position = await playTrackDirect(voiceChannel, results[0]);
      await interaction.editReply({ embeds: [makePlayEmbed(results[0], position)] });
      return;
    }

    // 검색 결과 목록 표시
    const list = results.map((t, i) =>
      `**${i + 1}.** [${t.title}](${t.url}) (${t.duration})`
    ).join("\n");

    const embed = {
      color: 0x3182f6,
      title: `"${query}" 검색 결과`,
      description: list,
      footer: { text: "30초 안에 선택해줘" },
    };

    // 1~5번 버튼 + URL 직접 입력 버튼
    const buttons = results.map((_, i) =>
      new ButtonBuilder()
        .setCustomId(`play_${i}`)
        .setLabel(`${i + 1}`)
        .setStyle(ButtonStyle.Primary)
    );
    buttons.push(
      new ButtonBuilder()
        .setCustomId("play_url")
        .setLabel("URL 입력")
        .setStyle(ButtonStyle.Secondary)
    );

    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(buttons);
    const msg = await interaction.editReply({ embeds: [embed], components: [row] });

    // 버튼 클릭 대기 (30초)
    try {
      const btnInteraction = await msg.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === interaction.user.id,
        time: 30000,
      });

      if (btnInteraction.customId === "play_url") {
        // URL 입력 모달
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
          await modalInteraction.reply({ embeds: [makePlayEmbed(tracks[0], position)] });
          await interaction.editReply({ embeds: [embed], components: [] });
        } catch {
          await interaction.editReply({ embeds: [embed], components: [] });
        }
      } else {
        // 번호 선택
        const idx = parseInt(btnInteraction.customId.split("_")[1]);
        const track = results[idx];
        const position = await playTrackDirect(voiceChannel, track);

        await btnInteraction.update({ embeds: [makePlayEmbed(track, position)], components: [] });
      }
    } catch {
      // 타임아웃 — 버튼 제거
      await interaction.editReply({ embeds: [embed], components: [] }).catch(() => {});
    }
  } catch (err) {
    await interaction.editReply(`에러 발생... @д@ ${(err as Error).message}`);
  }
}

function makePlayEmbed(track: Track, position: number) {
  return {
    color: 0x3182f6,
    title: position === 1 ? "Now Playing" : `#${position} 대기열 추가`,
    description: `**[${track.title}](${track.url})**`,
    fields: [
      { name: "길이", value: track.duration, inline: true },
      { name: "요청", value: track.requestedBy, inline: true },
    ],
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

  const list = tracks.map((t, i) =>
    `${i === 0 ? "▸ " : `${i}. `}**${t.title}** (${t.duration}) — ${t.requestedBy}`
  ).join("\n");

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

  const embed = {
    color: 0x3182f6,
    title: "Now Playing",
    description: `**[${track.title}](${track.url})**`,
    fields: [
      { name: "길이", value: track.duration, inline: true },
      { name: "요청", value: track.requestedBy, inline: true },
    ],
    thumbnail: track.thumbnail ? { url: track.thumbnail } : undefined,
  };

  await interaction.reply({ embeds: [embed] });
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
