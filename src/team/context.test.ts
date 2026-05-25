import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/client", () => ({
  prisma: {
    teamMember: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    team: {
      findFirst: vi.fn(),
    },
    activeTeamSelection: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "../db/client";
import { resolveTeamContext } from "./context";
import { TeamLoginRequiredError, TeamSelectionRequiredError } from "./errors";

describe("resolveTeamContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves the guild default team when the user is a member", async () => {
    const team = { id: "team_1", name: "Guild Team", slug: "guild-team", guildId: "guild_1" };
    vi.mocked(prisma.team.findFirst).mockResolvedValue(team as never);
    vi.mocked(prisma.teamMember.findFirst).mockResolvedValue({
      id: "member_1",
      teamId: "team_1",
      discordUserId: "user_1",
      displayName: "User",
      role: "MEMBER",
      createdAt: new Date(),
      team,
    } as never);

    const result = await resolveTeamContext({ guildId: "guild_1", discordUserId: "user_1" });

    expect(result.team).toBe(team);
    expect(result.member.teamId).toBe("team_1");
    expect(prisma.team.findFirst).toHaveBeenCalledWith({ where: { guildId: "guild_1" } });
    expect(prisma.teamMember.findFirst).toHaveBeenCalledWith({
      where: { teamId: "team_1", discordUserId: "user_1" },
      include: { team: true },
    });
  });

  it("throws login required when a guild has no team", async () => {
    vi.mocked(prisma.team.findFirst).mockResolvedValue(null as never);

    await expect(resolveTeamContext({ guildId: "guild_1", discordUserId: "user_1" }))
      .rejects.toBeInstanceOf(TeamLoginRequiredError);
  });

  it("throws login required when the user is not a member of the guild team", async () => {
    vi.mocked(prisma.team.findFirst).mockResolvedValue({ id: "team_1", name: "Guild Team", slug: "guild-team" } as never);
    vi.mocked(prisma.teamMember.findFirst).mockResolvedValue(null as never);

    await expect(resolveTeamContext({ guildId: "guild_1", discordUserId: "user_1" }))
      .rejects.toBeInstanceOf(TeamLoginRequiredError);
  });

  it("resolves a DM team when the user has exactly one team", async () => {
    const membership = {
      id: "member_1",
      teamId: "team_1",
      discordUserId: "user_1",
      displayName: "User",
      role: "OWNER",
      createdAt: new Date(),
      team: { id: "team_1", name: "Solo", slug: "solo", guildId: null },
    };
    vi.mocked(prisma.teamMember.findMany).mockResolvedValue([membership] as never);

    const result = await resolveTeamContext({ guildId: null, discordUserId: "user_1" });

    expect(result.team).toBe(membership.team);
    expect(result.member).toBe(membership);
  });

  it("resolves active DM team when the user selected one", async () => {
    const memberships = [
      { teamId: "team_1", team: { id: "team_1", name: "One", slug: "one" } },
      { teamId: "team_2", team: { id: "team_2", name: "Two", slug: "two" } },
    ];
    vi.mocked(prisma.teamMember.findMany).mockResolvedValue(memberships as never);
    vi.mocked(prisma.activeTeamSelection.findUnique).mockResolvedValue({ discordUserId: "user_1", teamId: "team_2" } as never);

    const result = await resolveTeamContext({ guildId: null, discordUserId: "user_1" });

    expect(result.team.slug).toBe("two");
    expect(result.member.teamId).toBe("team_2");
  });

  it("throws selection required for DM when the user has multiple teams", async () => {
    vi.mocked(prisma.teamMember.findMany).mockResolvedValue([
      { teamId: "team_1", team: { name: "One", slug: "one" } },
      { teamId: "team_2", team: { name: "Two", slug: "two" } },
    ] as never);
    vi.mocked(prisma.activeTeamSelection.findUnique).mockResolvedValue(null as never);

    await expect(resolveTeamContext({ guildId: null, discordUserId: "user_1" }))
      .rejects.toBeInstanceOf(TeamSelectionRequiredError);
  });
});
