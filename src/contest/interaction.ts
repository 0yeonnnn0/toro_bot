import { MessageFlags, type ButtonInteraction } from "discord.js";
import { parseContestCustomId } from "./notification";
import { hasContestNotification, listInterestedUserIds, setContestPreference } from "./store";

function interestedContent(userIds: string[]): string {
  if (userIds.length === 0) return "관심: 아직 없음";
  return `관심: ${userIds.map((userId) => `<@${userId}>`).join(", ")}`;
}

const messageRefreshes = new Map<string, Promise<void>>();

async function refreshInterestedUsers(interaction: ButtonInteraction, contestId: string): Promise<void> {
  const messageId = interaction.message.id;
  const previous = messageRefreshes.get(messageId) ?? Promise.resolve();
  const refresh = previous.catch(() => undefined).then(async () => {
    const interestedUserIds = await listInterestedUserIds(interaction.channelId, contestId);
    await interaction.message.edit({
      content: interestedContent(interestedUserIds),
      allowedMentions: { parse: [] },
    });
  });
  messageRefreshes.set(messageId, refresh);
  try {
    await refresh;
  } finally {
    if (messageRefreshes.get(messageId) === refresh) messageRefreshes.delete(messageId);
  }
}

export async function handleContestButton(interaction: ButtonInteraction): Promise<boolean> {
  const parsed = parseContestCustomId(interaction.customId);
  if (!parsed) return false;

  if (!interaction.guildId || !interaction.channelId) {
    await interaction.reply({ content: "서버 채널이나 스레드에 게시된 공모전 버튼만 사용할 수 있어냥.", flags: MessageFlags.Ephemeral });
    return true;
  }

  await interaction.deferUpdate();
  const validMessage = await hasContestNotification(interaction.channelId, parsed.contestId, interaction.message.id);
  if (!validMessage) {
    await interaction.followUp({ content: "유효하지 않거나 이미 종료된 공모전 알림이야.", flags: MessageFlags.Ephemeral });
    return true;
  }

  const status = parsed.action === "interest" ? "INTERESTED" : "IGNORED";
  await setContestPreference(interaction.channelId, interaction.user.id, parsed.contestId, status);
  await refreshInterestedUsers(interaction, parsed.contestId);

  await interaction.followUp({
    content: parsed.action === "interest"
      ? "관심 공모전에 저장했어냥."
      : "관심 없음으로 저장했어냥. 공용 알림은 다른 사람도 보니까 그대로 둘게.",
    flags: MessageFlags.Ephemeral,
  });
  return true;
}
