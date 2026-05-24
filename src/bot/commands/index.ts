import {
  ChatInputCommandInteraction,
  REST,
  Routes,
} from "discord.js";
import { commands } from "./definitions";
import { handleQuestion, handleSummary } from "./chat";
import { handleHelp, handleStatus } from "./settings";
import { handleDraw, handleSay } from "./media";
import { handleMyInfo } from "./vault";
import {
  handlePlay, handleSkip, handleStop, handlePause,
  handleQueueCmd, handleNowPlaying, handleVolume,
  handleAutoplay, handleRemove,
} from "./music";

export { commands } from "./definitions";
export { handleMusicButton } from "./music";

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
