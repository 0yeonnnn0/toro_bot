import type { TeamRole } from "@prisma/client";
import { prisma } from "./client";

export interface CreateTeamInput {
  name: string;
  slug: string;
  guildId?: string | null;
  ownerDiscordUserId: string;
  ownerDisplayName: string;
}

export interface AddTeamMemberInput {
  teamId: string;
  discordUserId: string;
  displayName: string;
  role?: TeamRole;
}

export async function createTeam(input: CreateTeamInput) {
  return prisma.team.create({
    data: {
      name: input.name,
      slug: input.slug,
      guildId: input.guildId ?? null,
      ownerId: input.ownerDiscordUserId,
      members: {
        create: {
          discordUserId: input.ownerDiscordUserId,
          displayName: input.ownerDisplayName,
          role: "OWNER",
        },
      },
    },
  });
}

export async function getTeamBySlug(slug: string) {
  return prisma.team.findUnique({ where: { slug } });
}

export async function addTeamMember(input: AddTeamMemberInput) {
  const existing = await prisma.teamMember.findUnique({
    where: {
      teamId_discordUserId: {
        teamId: input.teamId,
        discordUserId: input.discordUserId,
      },
    },
  });

  if (existing) return existing;

  return prisma.teamMember.create({
    data: {
      teamId: input.teamId,
      discordUserId: input.discordUserId,
      displayName: input.displayName,
      role: input.role ?? "MEMBER",
    },
  });
}
