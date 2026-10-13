import type { ChatInputCommandInteraction } from "discord.js";
import { state } from "../../shared/state";
import { getQueueStats } from "../queue";

export async function handleHelp(interaction: ChatInputCommandInteraction): Promise<void> {
  const embed = {
    color: 0x3182f6,
    title: "🐱 TORO 사용 가이드",
    description: "불러서 정리하고, 고르고, 놀고, 끝나면 잊는 디스코드 친구",
    fields: [
      {
        name: "💬 대화",
        value: [
          "`@TORO` — 현재 채널·스레드의 최근 대화를 읽고 답변",
          "`@TORO 정리해줘` 또는 `/summary` — 약속·결정·할 일 요약",
          "`@TORO 골라줘` — 대화에 나온 후보 중 선택",
        ].join("\n"),
      },
      {
        name: "🎵 파티 음악",
        value: [
          "`/play` — 유튜브 음악 검색/재생",
          "`/nowplaying` — 현재 곡과 컨트롤러",
          "`/skip` · `/stop` · `/pause` — 재생 컨트롤",
          "`/queue` · `/remove` · `/volume` · `/autoplay` — 대기열 관리",
        ].join("\n"),
      },
      {
        name: "🎨 이미지",
        value: "`/draw` — AI 이미지 생성",
      },
      {
        name: "⚙️ 채널 설정",
        value: [
          "`/status` — 봇 상태 확인",
          "`/mute` — 현재 채널의 TORO 멘션 응답 끄기/다시 켜기",
          "`/mutestatus` — 현재 채널 음소거 상태 확인",
        ].join("\n"),
      },
      {
        name: "🫧 기억 정책",
        value: "요청할 때 Discord 최근 대화만 읽고, 별도 장기 기억이나 사용자 프로필은 만들지 않음",
      },
    ],
  };

  await interaction.reply({ embeds: [embed] });
}

export async function handleStatus(interaction: ChatInputCommandInteraction): Promise<void> {
  const uptime = Date.now() - state.stats.startedAt;
  const h = Math.floor(uptime / 3600000);
  const m = Math.floor((uptime % 3600000) / 60000);
  const queue = getQueueStats();

  const embed = {
    color: 0x6c8aff,
    title: "TORO Bot Status",
    fields: [
      { name: "Uptime", value: `${h}h ${m}m`, inline: true },
      { name: "Requests", value: `${state.stats.messagesProcessed}`, inline: true },
      { name: "Replies", value: `${state.stats.repliesSent}`, inline: true },
      { name: "Reply", value: "멘션 전용", inline: true },
      { name: "Memory", value: "ephemeral", inline: true },
      { name: "Model", value: state.config.model, inline: true },
      { name: "Queue", value: `${queue.activeCount}/${queue.maxConcurrent} active`, inline: true },
    ],
  };

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
