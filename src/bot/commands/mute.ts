import type { ChatInputCommandInteraction } from "discord.js";

// channelId → unmute timestamp
export const mutedChannels = new Map<string, number>();

export async function handleMute(interaction: ChatInputCommandInteraction): Promise<void> {
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

export async function handleMuteStatus(interaction: ChatInputCommandInteraction): Promise<void> {
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
