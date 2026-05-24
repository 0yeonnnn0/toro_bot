import type { Team, TeamMember } from "@prisma/client";
import { prisma } from "../db/client";
import { TeamLoginRequiredError, TeamSelectionRequiredError } from "./errors";

export interface ResolveTeamContextInput {
  guildId?: string | null;
  discordUserId: string;
}

export interface TeamContext {
  team: Team;
  member: TeamMember & { team?: Team };
}

export async function resolveTeamContext(input: ResolveTeamContextInput): Promise<TeamContext> {
  if (input.guildId) {
    return resolveGuildTeamContext(input.guildId, input.discordUserId);
  }

  return resolveDmTeamContext(input.discordUserId);
}

async function resolveGuildTeamContext(guildId: string, discordUserId: string): Promise<TeamContext> {
  const team = await prisma.team.findFirst({ where: { guildId } });
  if (!team) {
    throw new TeamLoginRequiredError("이 서버에는 아직 TORO 팀이 없다냥. `/team create`로 먼저 팀을 만들어줘라냥.");
  }

  const member = await prisma.teamMember.findFirst({
    where: { teamId: team.id, discordUserId },
    include: { team: true },
  });

  if (!member) {
    throw new TeamLoginRequiredError("이 TORO 팀에 아직 로그인되어 있지 않다냥. `/login` 또는 `/team join`을 먼저 해줘라냥.");
  }

  return { team, member };
}

async function resolveDmTeamContext(discordUserId: string): Promise<TeamContext> {
  const memberships = await prisma.teamMember.findMany({
    where: { discordUserId },
    include: { team: true },
  });

  if (memberships.length === 0) {
    throw new TeamLoginRequiredError("아직 가입한 TORO 팀이 없다냥. 서버에서 `/team create` 또는 `/team join`을 먼저 해줘라냥.");
  }

  if (memberships.length > 1) {
    throw new TeamSelectionRequiredError("가입한 TORO 팀이 여러 개다냥. 사용할 팀을 먼저 선택해줘라냥.");
  }

  const member = memberships[0];
  return { team: member.team, member };
}
