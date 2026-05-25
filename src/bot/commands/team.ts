import type { ChatInputCommandInteraction } from "discord.js";
import {
  addTeamMember,
  createTeam,
  createTeamInvite,
  getInviteByCode,
  getMembershipsForUser,
  getTeamByGuildId,
  getTeamMembers,
  getMembershipForTeamSlug,
  setActiveTeamForUser,
} from "../../db/team-store";
import { resolveTeamContext } from "../../team/context";
import { TeamLoginRequiredError, TeamSelectionRequiredError } from "../../team/errors";

const INVITE_CODE_LENGTH = 8;
const INVITE_TTL_MS = 60 * 60 * 1000;

export function makeTeamSlug(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replace(/[^\p{Letter}\p{Number}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug || `team-${Date.now()}`;
}

function makeInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export function buildLoginStatusMessage(memberships: Array<{ role: string; team: { name: string; slug: string } }>): string {
  if (memberships.length === 0) {
    return [
      "아직 가입한 TORO 팀이 없다냥.",
      "`/team create name:<팀이름>` 으로 새 팀을 만들거나,",
      "팀장한테 초대 코드를 받아 `/team join code:<코드>`로 가입하면 된다냥.",
    ].join("\n");
  }

  const teams = memberships
    .map((m) => `- ${m.team.name} (\`${m.team.slug}\`, ${m.role})`)
    .join("\n");
  return `현재 가입된 TORO 팀이다냥:\n${teams}`;
}

export async function handleLogin(interaction: ChatInputCommandInteraction): Promise<void> {
  const memberships = await getMembershipsForUser(interaction.user.id);
  await interaction.reply({ content: buildLoginStatusMessage(memberships), ephemeral: true });
}

export async function handleTeamCreate(interaction: ChatInputCommandInteraction): Promise<void> {
  const name = interaction.options.getString("name", true);
  const slug = makeTeamSlug(name);
  if (interaction.guildId) {
    const existing = await getTeamByGuildId(interaction.guildId);
    if (existing) {
      await interaction.reply({
        content: `이 서버에는 이미 TORO 팀 **${existing.name}** 이 있다냥. 새 팀 대신 \`/team info\` 또는 \`/team invite\`를 써줘라냥.`,
        ephemeral: true,
      });
      return;
    }
  }
  const team = await createTeam({
    name,
    slug,
    guildId: interaction.guildId ?? null,
    ownerDiscordUserId: interaction.user.id,
    ownerDisplayName: interaction.user.displayName,
  });

  await interaction.reply({
    content: `TORO 팀 **${team.name}** 을 만들었다냥. 슬러그는 \`${team.slug}\` 다냥.`,
    ephemeral: true,
  });
}

export async function handleTeamInvite(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const { team, member } = await resolveTeamContext({
      guildId: interaction.guildId,
      discordUserId: interaction.user.id,
    });

    if (member.role !== "OWNER" && member.role !== "ADMIN") {
      await interaction.reply({ content: "팀 초대 코드는 OWNER/ADMIN만 만들 수 있다냥.", ephemeral: false });
      return;
    }

    const invite = await createTeamInvite({
      teamId: team.id,
      createdById: interaction.user.id,
      code: makeInviteCode(),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    });

    await interaction.reply({
      content: [
        `팀 **${team.name}** 초대 코드다냥: \`${invite.code}\``,
        "이 코드는 1시간 동안 여러 명이 사용할 수 있다냥.",
        `가입은 \`/team join code:${invite.code}\` 로 하면 된다냥.`,
      ].join("\n"),
      ephemeral: false,
    });
  } catch (err) {
    await interaction.reply({ content: formatTeamError(err), ephemeral: false });
  }
}

export async function handleTeamJoin(interaction: ChatInputCommandInteraction): Promise<void> {
  const code = interaction.options.getString("code", true).trim().toUpperCase();
  const invite = await getInviteByCode(code);

  if (!invite || (invite.expiresAt && invite.expiresAt.getTime() < Date.now())) {
    await interaction.reply({ content: "유효하지 않거나 만료된 초대 코드다냥.", ephemeral: false });
    return;
  }

  const member = await addTeamMember({
    teamId: invite.teamId,
    discordUserId: interaction.user.id,
    displayName: interaction.user.displayName,
  });

  await interaction.reply({
    content: `팀 **${invite.team.name}** 에 ${member.role}로 가입했다냥.`,
    ephemeral: false,
  });
}

export async function handleTeamInfo(interaction: ChatInputCommandInteraction): Promise<void> {
  const memberships = await getMembershipsForUser(interaction.user.id);
  if (memberships.length === 0) {
    await interaction.reply({ content: buildLoginStatusMessage([]), ephemeral: true });
    return;
  }

  const lines = memberships.map((m) => `- ${m.team.name} (\`${m.team.slug}\`, ${m.role})`);
  await interaction.reply({ content: `가입된 TORO 팀이다냥:\n${lines.join("\n")}`, ephemeral: true });
}

export async function handleTeamMembers(interaction: ChatInputCommandInteraction): Promise<void> {
  try {
    const { team } = await resolveTeamContext({ guildId: interaction.guildId, discordUserId: interaction.user.id });
    const members = await getTeamMembers(team.id);
    const lines = members.map((m) => `- ${m.displayName} (${m.role})`);
    await interaction.reply({ content: `**${team.name}** 멤버다냥:\n${lines.join("\n")}`, ephemeral: false });
  } catch (err) {
    await interaction.reply({ content: formatTeamError(err), ephemeral: false });
  }
}

export async function handleTeamSwitch(interaction: ChatInputCommandInteraction): Promise<void> {
  const teamSlug = interaction.options.getString("team", true).trim();
  const membership = await getMembershipForTeamSlug(interaction.user.id, teamSlug);

  if (!membership) {
    await interaction.reply({
      content: `가입한 팀 중 \`${teamSlug}\` 슬러그를 찾지 못했다냥. \`/team info\`로 팀 목록을 확인해줘라냥.`,
      ephemeral: true,
    });
    return;
  }

  await setActiveTeamForUser(interaction.user.id, membership.teamId);
  const guildNote = interaction.guildId
    ? "\n참고로 서버 채널에서는 서버에 연결된 TORO 팀이 우선이고, 이 선택은 DM/다중 팀 문맥에 적용된다냥."
    : "";
  await interaction.reply({
    content: `앞으로 사용할 TORO 팀을 **${membership.team.name}** (\`${membership.team.slug}\`)로 선택했다냥.${guildNote}`,
    ephemeral: true,
  });
}

export async function handleTeamCommand(interaction: ChatInputCommandInteraction): Promise<void> {
  const subcommand = interaction.options.getSubcommand();
  switch (subcommand) {
    case "create":
      await handleTeamCreate(interaction);
      break;
    case "invite":
      await handleTeamInvite(interaction);
      break;
    case "join":
      await handleTeamJoin(interaction);
      break;
    case "switch":
      await handleTeamSwitch(interaction);
      break;
    case "info":
      await handleTeamInfo(interaction);
      break;
    case "members":
      await handleTeamMembers(interaction);
      break;
  }
}

function formatTeamError(err: unknown): string {
  if (err instanceof TeamLoginRequiredError || err instanceof TeamSelectionRequiredError) {
    return err.message;
  }
  return "TORO 팀 처리 중 문제가 생겼다냥.";
}
