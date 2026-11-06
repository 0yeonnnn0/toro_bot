import {
  ChatInputCommandInteraction,
  REST,
  Routes,
} from "discord.js";
import { commands } from "./definitions";
import { handleSummary } from "./chat";
import { handleHelp, handleStatus } from "./settings";
import { handleDraw } from "./media";
import { handleMute, handleMuteStatus } from "./mute";
import { handleContestCommand } from "./contest";
import {
  handlePlay, handleSkip, handleStop, handlePause,
  handleQueueCmd, handleNowPlaying, handleVolume,
  handleAutoplay, handleRemove,
} from "./music";

export { commands } from "./definitions";
export { handleMusicButton } from "./music";

// ── Register Commands ──
export async function registerCommands(clientId: string, token: string, guildIds: string[] = []): Promise<void> {
  const rest = new REST({ version: "10" }).setToken(token);
  const body = commands.map(c => c.toJSON());
  console.log("슬래시 커맨드 등록 중...");

  const targets = [
    { label: "global:clear", route: Routes.applicationCommands(clientId), body: [] },
    ...guildIds.map(guildId => ({
      label: `guild:${guildId}`,
      route: Routes.applicationGuildCommands(clientId, guildId),
      body,
    })),
  ];

  for (const target of targets) {
    try {
      await rest.put(target.route, { body: target.body });
      console.log(`슬래시 커맨드 등록 완료: ${target.label}`);
    } catch (err) {
      console.error(`슬래시 커맨드 등록 실패: ${target.label}:`, (err as Error).message);
    }
  }
}

// ── Handle Interactions ──
export async function handleInteraction(interaction: ChatInputCommandInteraction): Promise<void> {
  const { commandName } = interaction;

  switch (commandName) {

    case "help":
      await handleHelp(interaction);
      break;
    case "status":
      await handleStatus(interaction);
      break;
    case "공모전":
      await handleContestCommand(interaction);
      break;
    case "mute":
      await handleMute(interaction);
      break;
    case "mutestatus":
      await handleMuteStatus(interaction);
      break;
    case "summary":
      await handleSummary(interaction);
      break;
    case "draw":
      await handleDraw(interaction);
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
      await handleQueueCmd(interaction);
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

// ── Autocomplete ──
export async function handleAutocomplete(interaction: any): Promise<void> {
  await interaction.respond([]);
}
