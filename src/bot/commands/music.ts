import {
  ChatInputCommandInteraction,
  ButtonInteraction,
} from "discord.js";
import {
  playTrackDirect,
  searchTracks,
  skip,
  prev,
  stop as musicStop,
  pause,
  getQueue,
  getNowPlaying,
  removeTrack,
  setAutoplay,
  getAutoplay,
  triggerAutoplayNow,
  parseArtist,
  setVolume,
  getVolume,
  isPaused,
} from "../music";
import { makePlayEmbed, buildControllerEmbed, buildControllerButtons, showSearchPage } from "./music-ui";

const SEARCH_TOTAL = 15; // 최대 3페이지

// ── /play ──
export async function handlePlay(interaction: ChatInputCommandInteraction): Promise<void> {
  const query = interaction.options.getString("query", true);
  const member = interaction.guild?.members.cache.get(interaction.user.id);
  const voiceChannel = member?.voice.channel;

  if (!voiceChannel) {
    await interaction.reply({ content: "먼저 음성 채널에 들어오라냥!", ephemeral: true });
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

    await showSearchPage(interaction, voiceChannel, query, allResults, 0);
  } catch (err) {
    await interaction.editReply(`에러 발생... @д@ ${(err as Error).message}`);
  }
}

// ── /skip ──
export async function handleSkip(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) return;

  const skipped = skip(guildId);
  if (skipped) {
    await interaction.reply(`**${skipped.title}** 스킵!`);
  } else {
    await interaction.reply({ content: "재생 중인 곡이 없다냥 @д@", ephemeral: true });
  }
}

// ── /stop ──
export async function handleStop(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) return;

  musicStop(guildId);
  await interaction.reply("음악 정지! 나간다냥 >w<");
}

// ── /pause ──
export async function handlePause(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) return;

  const paused = pause(guildId);
  await interaction.reply(paused ? "일시정지 ⏸️" : "재개 ▶️");
}

// ── /queue ──
export async function handleQueueCmd(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) return;

  const tracks = getQueue(guildId);
  if (tracks.length === 0) {
    await interaction.reply({ content: "대기열이 비어있다냥!", ephemeral: true });
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
export async function handleNowPlaying(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) return;

  const track = getNowPlaying(guildId);
  if (!track) {
    await interaction.reply({ content: "재생 중인 곡이 없다냥 @д@", ephemeral: true });
    return;
  }

  const paused = isPaused(guildId);
  const queue = getQueue(guildId);
  const embed = buildControllerEmbed(track, paused, queue);
  const row = buildControllerButtons(paused);

  await interaction.reply({ embeds: [embed], components: [row] });
}

// ── /volume ──
export async function handleVolume(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) return;

  const level = interaction.options.getInteger("level");

  if (level === null) {
    await interaction.reply(`현재 볼륨: **${getVolume(guildId)}%**`);
    return;
  }

  const result = setVolume(guildId, level / 100);
  await interaction.reply(`볼륨: **${result}%**`);
}

// ── /autoplay ──
export async function handleAutoplay(interaction: ChatInputCommandInteraction): Promise<void> {
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
      await interaction.reply({ content: "먼저 음성 채널에 들어오라냥!", ephemeral: true });
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
    await interaction.reply({ content: "먼저 음악을 재생하라냥!", ephemeral: true });
  }
}

// ── /remove ──
export async function handleRemove(interaction: ChatInputCommandInteraction): Promise<void> {
  const guildId = interaction.guildId;
  if (!guildId) return;

  const index = interaction.options.getInteger("번호", true);
  const removed = removeTrack(guildId, index);

  if (removed) {
    await interaction.reply(`**${removed.title}** 대기열에서 제거`);
  } else {
    await interaction.reply({ content: `${index}번 곡을 찾을 수 없다냥. \`/queue\`로 확인하라냥!`, ephemeral: true });
  }
}

// ── 버튼 인터랙션 핸들러 ──
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
        await interaction.reply({ content: "스킵할 곡이 없다냥 >w<", ephemeral: true });
      }
      break;
    }
    case "music_stop": {
      musicStop(guildId);
      await interaction.reply({ content: "음악 정지! 나간다냥 >w<", ephemeral: true });
      break;
    }
    case "music_prev": {
      const previous = prev(guildId);
      if (previous) {
        await interaction.reply({ content: `**${previous.title}** 이전 곡!`, ephemeral: true });
      } else {
        await interaction.reply({ content: "이전 곡이 없다냥 @д@", ephemeral: true });
      }
      break;
    }
  }
}
