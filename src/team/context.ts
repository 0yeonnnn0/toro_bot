import type { Team, TeamMember } from "@prisma/client";
import { prisma } from "../db/client";
import { TeamLoginRequiredError } from "./errors";

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

  throw new TeamLoginRequiredError("DM에서는 팀을 선택하지 않는다냥. Discord 서버에서 TORO를 불러줘라냥.");
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
  } else if (input.displayName && member.displayName !== input.displayName) {
    member = await prisma.teamMember.update({
      where: { id: member.id },
      data: { displayName: input.displayName },
    });
  }

  return { team, member };
}
