import {
  MessageFlags,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
} from "discord.js";
import { runContestNotifierNow } from "../../contest/notifier";
import {
  disableContestSubscription,
  getContestSubscription,
  upsertContestSubscription,
} from "../../contest/store";

function canManage(interaction: ChatInputCommandInteraction): boolean {
  const ownerId = process.env.OWNER_ID?.trim();
  return interaction.user.id === ownerId
    || Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels))
    || Boolean(interaction.memberPermissions?.has(PermissionFlagsBits.ManageThreads));
}

export async function handleContestCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId || !interaction.channelId) {
    await interaction.reply({ content: "공모전 알림은 서버 채널이나 스레드에서 설정해줘냥.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (!canManage(interaction)) {
    await interaction.reply({ content: "채널 관리 권한이 있는 사람만 공모전 알림을 설정할 수 있어냥.", flags: MessageFlags.Ephemeral });
    return;
  }

  const action = interaction.options.getSubcommand();
  if (action === "시작") {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    await upsertContestSubscription({
      channelId: interaction.channelId,
      guildId: interaction.guildId,
      createdByUserId: interaction.user.id,
    });
    const result = await runContestNotifierNow(interaction.client, interaction.channelId);
    const suffix = result.sourceFailed ? " 다만 공모전 소스 조회가 실패해서 다음 주기에 다시 시도할게." : "";
    await interaction.editReply(`이 채널의 공모전 알림을 시작했어냥. 지금 ${result.sent}개를 공유했어.${suffix}`);
    return;
  }

  if (action === "중지") {
    const disabled = await disableContestSubscription(interaction.channelId);
    await interaction.reply({
      content: disabled ? "이 채널의 공모전 알림을 중지했어냥." : "이 채널에는 켜진 공모전 알림이 없어냥.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const subscription = await getContestSubscription(interaction.channelId);
  await interaction.reply({
    content: subscription?.enabled
      ? "이 채널의 공모전 알림은 켜져 있어냥. 하루 한 번 새 공모전을 공유해."
      : "이 채널의 공모전 알림은 꺼져 있어냥.",
    flags: MessageFlags.Ephemeral,
  });
}
