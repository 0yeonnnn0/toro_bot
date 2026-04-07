import {
  ChatInputCommandInteraction,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ComponentType,
} from "discord.js";
import { playTrackDirect, searchTracks, parseArtist, type Track } from "../music";

const SEARCH_PER_PAGE = 5;

export function makePlayEmbed(track: Track, position: number) {
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

export function buildControllerEmbed(track: Track, paused: boolean, queue: Track[]) {
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

export function buildControllerButtons(paused: boolean) {
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

export async function showSearchPage(
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
      await btnInteraction.deferUpdate();
      const idx = parseInt(btnInteraction.customId.split("_")[1]);
      const track = allResults[idx];
      const position = await playTrackDirect(voiceChannel, track);

      await btnInteraction.editReply({ content: null, embeds: [makePlayEmbed(track, position)], components: [buildControllerButtons(false)] });
    }
  } catch {
    await interaction.editReply({ embeds: [embed], components: [] }).catch(() => {});
  }
}
