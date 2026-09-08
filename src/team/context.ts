import type { Team, TeamMember } from "@prisma/client";
import { prisma } from "../db/client";
import { TeamLoginRequiredError, TeamSelectionRequiredError } from "./errors";

export interface ResolveTeamContextInput {
  guildId?: string | null;
  guildName?: string | null;
  guildOwnerId?: string | null;
  discordUserId: string;
  displayName?: string | null;
  canManageGuild?: boolean;
}

export interface TeamContext {
  team: Team;
  member: TeamMember & { team?: Team };
}

export async function resolveTeamContext(input: ResolveTeamContextInput): Promise<TeamContext> {
  if (input.guildId) {
    return resolveGuildTeamContext({ ...input, guildId: input.guildId });
  }

  return resolveLegacyDmTeamContext(input.discordUserId);
}

async function resolveLegacyDmTeamContext(discordUserId: string): Promise<TeamContext> {
  const memberships = await prisma.teamMember.findMany({
    where: { discordUserId, team: { guildId: null } },
    include: { team: true },
  });
  if (memberships.length === 0) {
    throw new TeamLoginRequiredError("DM에서는 새 팀을 만들지 않는다냥. Discord 서버에서 TORO를 불러줘라냥.");
  }
  if (memberships.length === 1) return { team: memberships[0].team, member: memberships[0] };

  const active = await prisma.activeTeamSelection.findUnique({ where: { discordUserId } });
  const selected = active && memberships.find(member => member.teamId === active.teamId);
  if (selected) return { team: selected.team, member: selected };

  throw new TeamSelectionRequiredError("기존 DM 팀이 여러 개라 자동으로 고를 수 없다냥. 데이터는 보존되어 있으니 관리자에게 Discord 서버 연결을 요청해줘라냥.");
}

async function resolveGuildTeamContext(input: ResolveTeamContextInput & { guildId: string }): Promise<TeamContext> {
  const { guildId, discordUserId } = input;
  let team = await prisma.team.findFirst({ where: { guildId } });
  if (!team) {
    try {
      team = await prisma.team.create({
        data: {
          name: input.guildName?.trim() || "Discord 서버",
          slug: `discord-${guildId}`,
          guildId,
          ownerId: input.guildOwnerId || discordUserId,
        },
      });
    } catch (err) {
      team = await prisma.team.findFirst({ where: { guildId } });
      if (!team) throw err;
    }
  }
  if (input.guildOwnerId && team.ownerId !== input.guildOwnerId) {
    team = await prisma.team.update({
      where: { id: team.id },
      data: { ownerId: input.guildOwnerId },
    });
  }

  let member = await prisma.teamMember.findUnique({
    where: { teamId_discordUserId: { teamId: team.id, discordUserId } },
  });

  if (!member) {
    member = await prisma.teamMember.create({
      data: {
        teamId: team.id,
        discordUserId,
        displayName: input.displayName?.trim() || "Discord 사용자",
        role: team.ownerId === discordUserId ? "OWNER" : input.canManageGuild ? "ADMIN" : "MEMBER",
      },
    });
  } else {
    const data: { displayName?: string; role?: "OWNER" | "ADMIN" | "MEMBER" } = {};
    if (input.displayName && member.displayName !== input.displayName) data.displayName = input.displayName;
    if (team.ownerId === discordUserId && member.role !== "OWNER") data.role = "OWNER";
    else if (input.canManageGuild && member.role !== "OWNER" && member.role !== "ADMIN") data.role = "ADMIN";
    else if (!input.canManageGuild && team.ownerId !== discordUserId && (member.role === "OWNER" || member.role === "ADMIN")) data.role = "MEMBER";
    if (Object.keys(data).length > 0) {
      member = await prisma.teamMember.update({ where: { id: member.id }, data });
    }
  }

  return { team, member };
}
