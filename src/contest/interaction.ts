import { MessageFlags, type ButtonInteraction } from "discord.js";
import { parseContestCustomId } from "./notification";
import { hasContestNotification, setContestPreference } from "./store";

export async function handleContestButton(interaction: ButtonInteraction): Promise<boolean> {
  const parsed = parseContestCustomId(interaction.customId);
  if (!parsed) return false;

  const ownerId = process.env.OWNER_ID?.trim();
  if (!ownerId || interaction.user.id !== ownerId || interaction.guildId) {
    await interaction.reply({ content: "유효한 공모전 DM 버튼이 아니다냥.", flags: MessageFlags.Ephemeral });
    return true;
  }
  const validMessage = await hasContestNotification(ownerId, parsed.contestId, interaction.message.id);
  if (!validMessage) {
    await interaction.reply({ content: "유효한 공모전 DM 버튼이 아니다냥.", flags: MessageFlags.Ephemeral });
    return true;
  }

  await interaction.deferUpdate();
  if (parsed.action === "interest") {
    await setContestPreference(ownerId, parsed.contestId, "INTERESTED");
    await interaction.followUp({ content: "관심 공모전에 저장했어냥.", flags: MessageFlags.Ephemeral });
    return true;
  }

  await setContestPreference(ownerId, parsed.contestId, "IGNORED");
  try {
    await interaction.message.delete();
  } catch {
    await interaction.message.edit({ content: "관심 없음으로 처리한 공모전이야.", embeds: [], components: [] });
  }
  await interaction.followUp({ content: "앞으로 이 공모전은 추천하지 않을게냥.", flags: MessageFlags.Ephemeral });
  return true;
}
