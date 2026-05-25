import type { ChatInputCommandInteraction } from "discord.js";
import { getActivePresetId, getPreset } from "../prompt";
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
          "`/status` — 봇 상태 확인",
          "`/mute` — 현재 채널에서 TORO 멘션 응답 잠시 끄기/다시 켜기",
          "`/mutestatus` — 현재 채널 음소거 상태 확인",
        ].join("\n"),
      },
    ],
  };

  await interaction.reply({ embeds: [embed] });
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
      { name: "Reply", value: "멘션 전용", inline: true },
      { name: "Model", value: state.config.model, inline: true },
      { name: "Preset", value: preset?.name || presetId, inline: true },
      { name: "Queue", value: `${queue.activeCount}/${queue.maxConcurrent} active`, inline: true },
      { name: "RAG", value: rag.enabled ? `${rag.vectorCount} vectors` : "disabled (no Google key)", inline: true },
      { name: "Vault Notes", value: `${getVaultStats().userNotes}`, inline: true },
    ],
  };

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
