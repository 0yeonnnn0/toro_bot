import type { ChatInputCommandInteraction } from "discord.js";
import { getPresets, setActivePreset, getActivePresetId, getPreset } from "../prompt";
import { state } from "../../shared/state";
import { getQueueStats } from "../queue";
import { getStats as getRagStats } from "../rag";
import { getVaultStats } from "../vault";

// ── /help ──
export async function handleHelp(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = {
    color: 0x3182f6,
    title: "🐱 TORO 사용 가이드",
    fields: [
      {
        name: "💬 대화",
        value: [
          "`@TORO` — 멘션하면 답변",
          "`/ask` — 1:1 질문",
          "`/summary` — 최근 대화 요약",
          "`/mode` — 성격 프리셋 변경",
        ].join("\n"),
      },
      {
        name: "🎵 음악",
        value: [
          "`/play` — 유튜브 음악 검색/재생",
          "`/nowplaying` — 현재 곡 + 컨트롤러 (◁◁ ❚❚ ■ ▷▷)",
          "`/skip` · `/stop` · `/pause` — 재생 컨트롤",
          "`/queue` · `/remove` — 대기열 관리",
          "`/volume` — 볼륨 조절 (현재 곡에 즉시 적용)",
          "`/autoplay` — 자동 추천 재생 (장르 선택 가능)",
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
          "`/reply` — 응답 모드 변경 (auto/interval/mute)",
          "`/mute` — 채널 음소거",
          "`/mute-status` — 음소거 상태 확인",
          "`/status` — 봇 상태 확인",
        ].join("\n"),
      },
    ],
  };

  await interaction.reply({ embeds: [embed] });
}

// ── /mode ──
export async function handleMode(interaction: ChatInputCommandInteraction): Promise<void> {
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

// ── /status ──
export async function handleStatus(interaction: ChatInputCommandInteraction): Promise<void> {
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

// ── /reply ──
export async function handleReply(interaction: ChatInputCommandInteraction): Promise<void> {
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
