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

export async function getTeamByGuildId(guildId: string) {
  return prisma.team.findUnique({ where: { guildId } });
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


export async function getMembershipsForUser(discordUserId: string) {
  return prisma.teamMember.findMany({
    where: { discordUserId },
    include: { team: true },
    orderBy: { createdAt: "asc" },
  });
}

export async function getTeamMembers(teamId: string) {
  return prisma.teamMember.findMany({
    where: { teamId },
    orderBy: { createdAt: "asc" },
  });
}

export async function createTeamInvite(input: { teamId: string; createdById: string; code: string; expiresAt?: Date | null }) {
  return prisma.teamInvite.create({
    data: {
      teamId: input.teamId,
      createdById: input.createdById,
      code: input.code,
      expiresAt: input.expiresAt ?? null,
    },
  });
}

export async function getInviteByCode(code: string) {
  return prisma.teamInvite.findUnique({
    where: { code },
    include: { team: true },
  });
}

export async function markInviteUsed(inviteId: string) {
  return prisma.teamInvite.update({
    where: { id: inviteId },
    data: { usedAt: new Date() },
  });
}
