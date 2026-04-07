import type { ChatInputCommandInteraction } from "discord.js";
import { getReply } from "../ai";
import { getPreset, getActivePresetId } from "../prompt";
import { generateImage, type ImageModel } from "../draw";
import { generateSpeech, type VoiceName } from "../tts";

// ── /draw ──
export async function handleDraw(interaction: ChatInputCommandInteraction): Promise<void> {
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
      await interaction.editReply("그림 그리다 뭔가 고장났다냥... @д@ [MD]\n" + msg);
    }
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
