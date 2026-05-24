import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./client", () => ({
  prisma: {
    team: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
    teamMember: {
      create: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "./client";
import { addTeamMember, createTeam, getTeamByGuildId, getTeamBySlug } from "./team-store";

describe("team-store", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a team and owner membership in one call", async () => {
    const createdTeam = {
      id: "team_1",
      name: "My Team",
      slug: "my-team",
      guildId: "guild_1",
      ownerId: "user_1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(prisma.team.create).mockResolvedValue(createdTeam as never);

    const result = await createTeam({
      name: "My Team",
      slug: "my-team",
      guildId: "guild_1",
      ownerDiscordUserId: "user_1",
      ownerDisplayName: "Owner",
    });

    expect(result).toBe(createdTeam);
    expect(prisma.team.create).toHaveBeenCalledWith({
      data: {
        name: "My Team",
        slug: "my-team",
        guildId: "guild_1",
        ownerId: "user_1",
        members: {
          create: {
            discordUserId: "user_1",
            displayName: "Owner",
            role: "OWNER",
          },
        },
      },
    });
  });

  it("adds a member only when membership does not already exist", async () => {
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(null as never);
    const createdMember = {
      id: "member_1",
      teamId: "team_1",
      discordUserId: "user_2",
      displayName: "Member",
      role: "MEMBER",
      createdAt: new Date(),
    };
    vi.mocked(prisma.teamMember.create).mockResolvedValue(createdMember as never);

    const result = await addTeamMember({
      teamId: "team_1",
      discordUserId: "user_2",
      displayName: "Member",
    });

    expect(result).toBe(createdMember);
    expect(prisma.teamMember.findUnique).toHaveBeenCalledWith({
      where: { teamId_discordUserId: { teamId: "team_1", discordUserId: "user_2" } },
    });
    expect(prisma.teamMember.create).toHaveBeenCalledWith({
      data: {
        teamId: "team_1",
        discordUserId: "user_2",
        displayName: "Member",
        role: "MEMBER",
      },
    });
  });

  it("returns existing membership instead of creating a duplicate", async () => {
    const existingMember = {
      id: "member_1",
      teamId: "team_1",
      discordUserId: "user_2",
      displayName: "Member",
      role: "MEMBER",
      createdAt: new Date(),
    };
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(existingMember as never);

    const result = await addTeamMember({
      teamId: "team_1",
      discordUserId: "user_2",
      displayName: "Member",
    });

    expect(result).toBe(existingMember);
    expect(prisma.teamMember.create).not.toHaveBeenCalled();
  });

  it("finds a team by guild id", async () => {
    const team = { id: "team_1", name: "My Team", slug: "my-team", guildId: "guild_1", ownerId: "user_1", createdAt: new Date(), updatedAt: new Date() };
    vi.mocked(prisma.team.findUnique).mockResolvedValue(team as never);

    await expect(getTeamByGuildId("guild_1")).resolves.toBe(team);
    expect(prisma.team.findUnique).toHaveBeenCalledWith({ where: { guildId: "guild_1" } });
  });

  it("finds a team by slug", async () => {
    const team = {
      id: "team_1",
      name: "My Team",
      slug: "my-team",
      guildId: null,
      ownerId: "user_1",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    vi.mocked(prisma.team.findUnique).mockResolvedValue(team as never);

    await expect(getTeamBySlug("my-team")).resolves.toBe(team);
    expect(prisma.team.findUnique).toHaveBeenCalledWith({ where: { slug: "my-team" } });
  });
});
