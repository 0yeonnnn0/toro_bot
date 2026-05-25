import type { ChatInputCommandInteraction } from "discord.js";
import { resolveTeamContext } from "../../team/context";
import { TeamLoginRequiredError, TeamSelectionRequiredError } from "../../team/errors";
import { handleCalendarConnect, handleCalendarStatus, handleCalendarList, handleCalendarCreate } from "../../tools/calendar/calendar-tool";
import { deleteCalendarConnection } from "../../tools/calendar/calendar-store";

function formatCalendarError(err: unknown): string {
  if (err instanceof TeamLoginRequiredError || err instanceof TeamSelectionRequiredError) return err.message;
  const msg = (err as Error).message || "";
  if (msg.includes("TOKEN_ENCRYPTION_KEY")) {
    return "캘린더 OAuth 암호화 키를 만들거나 읽지 못했다냥. 기본값은 /app/data/token-encryption.key에 자동 생성되니 data 볼륨 권한을 확인해줘라냥.";
  }
  if (msg.includes("Google Calendar OAuth") || msg.includes("callback URL")) {
    return msg;
  }
  return msg || "캘린더 처리 중 문제가 생겼다냥.";
}

export async function handleCalendarCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const subcommand = interaction.options.getSubcommand();
    const { team, member } = await resolveTeamContext({ guildId: interaction.guildId, discordUserId: interaction.user.id });
    if (subcommand === "connect") {
      await interaction.reply({ content: await handleCalendarConnect({ teamId: team.id, role: member.role, connectedByDiscordUserId: interaction.user.id }), ephemeral: true });
      return;
    }
    if (subcommand === "status") {
      await interaction.reply({ content: await handleCalendarStatus({ teamId: team.id }), ephemeral: true });
      return;
    }
    if (subcommand === "disconnect") {
      if (member.role !== "OWNER" && member.role !== "ADMIN") throw new Error("캘린더 연결/해제는 OWNER/ADMIN만 할 수 있다냥.");
      await deleteCalendarConnection(team.id).catch(() => null);
      await interaction.reply({ content: "팀 캘린더 연결을 해제했다냥.", ephemeral: true });
      return;
    }
    if (subcommand === "list") {
      const range = interaction.options.getString("range") || "이번주";
      await interaction.reply({ content: await handleCalendarList({ teamId: team.id, range }), ephemeral: true });
      return;
    }
    if (subcommand === "add") {
      const title = interaction.options.getString("title", true);
      const date = interaction.options.getString("date", true);
      const time = interaction.options.getString("time") || "";
      await interaction.reply({ content: await handleCalendarCreate({ teamId: team.id, title, startsAt: `${date} ${time}`.trim(), requestedByDiscordUserId: interaction.user.id }), ephemeral: true });
    }
  } catch (err) {
    await interaction.reply({ content: formatCalendarError(err), ephemeral: true });
  }
}
