import type { ChatInputCommandInteraction } from "discord.js";
import { getReply } from "../ai";
import { getPreset, getActivePresetId } from "../prompt";
import { generateImage, type ImageModel } from "../draw";
import { generateSpeech, type VoiceName } from "../tts";

const IMAGE_FAILURE_MESSAGE = "이미지 생성에 실패했다냥... @д@";
const DISCORD_CONTENT_LIMIT = 2000;

function truncateDiscordContent(content: string): string {
  if (content.length <= DISCORD_CONTENT_LIMIT) return content;
  return content.slice(0, DISCORD_CONTENT_LIMIT - 1) + "…";
}

export function formatSayReplyContent(message: string, textReply: string, suffix = ""): string {
  return truncateDiscordContent(`**원본 메시지**\n${message}\n\n**토로 답변**\n${textReply}${suffix}`);
}

// ── /draw ──
export async function handleDraw(interaction: ChatInputCommandInteraction): Promise<void> {
  const prompt = interaction.options.getString("prompt", true);
  const quality = (interaction.options.getString("quality") || "flash") as ImageModel;
  await interaction.deferReply();

  try {
    const result = await generateImage(prompt, quality);
    if (result) {
      const label = result.usedModel === "pro" ? ` (${result.provider} high)` : ` (${result.provider} fast)`;
      await interaction.editReply({
        content: `**${prompt}**${label}`,
        files: [result.attachment],
      });
    } else {
      await interaction.editReply(IMAGE_FAILURE_MESSAGE);
    }
  } catch (err) {
    console.warn(`[Image] /draw failed: ${(err as Error).message.slice(0, 160)}`);
    await interaction.editReply(IMAGE_FAILURE_MESSAGE);
  }
}

// ── /say ──
export async function handleSay(interaction: ChatInputCommandInteraction): Promise<void> {
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
    const content = formatSayReplyContent(message, textReply);
    if (attachment) {
      await interaction.editReply({
        content,
        files: [attachment],
        allowedMentions: { parse: [] },
      });
    } else {
      await interaction.editReply({
        content: formatSayReplyContent(message, textReply, "\n\n*목소리가 안 나온다냥... @д@*"),
        allowedMentions: { parse: [] },
      });
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
