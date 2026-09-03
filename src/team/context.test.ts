import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../db/client", () => ({
  prisma: {
    teamMember: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    team: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    activeTeamSelection: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "../db/client";
import { resolveTeamContext } from "./context";

describe("resolveTeamContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("resolves the guild default team when the user is a member", async () => {
    const team = { id: "team_1", name: "Guild Team", slug: "guild-team", guildId: "guild_1" };
    vi.mocked(prisma.team.findFirst).mockResolvedValue(team as never);
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue({
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
    expect(prisma.teamMember.findUnique).toHaveBeenCalledWith({
      where: { teamId_discordUserId: { teamId: "team_1", discordUserId: "user_1" } },
    });
  });

  it("creates a guild-backed team automatically when the server has none", async () => {
    vi.mocked(prisma.team.findFirst).mockResolvedValue(null as never);
    vi.mocked(prisma.team.create).mockResolvedValue({ id: "team_1", name: "Guild One", slug: "discord-guild_1", guildId: "guild_1", ownerId: "owner_1" } as never);
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.teamMember.create).mockResolvedValue({ id: "member_1", teamId: "team_1", discordUserId: "user_1", displayName: "User", role: "MEMBER" } as never);

    const result = await resolveTeamContext({ guildId: "guild_1", guildName: "Guild One", guildOwnerId: "owner_1", discordUserId: "user_1", displayName: "User" });

    expect(prisma.team.create).toHaveBeenCalledWith({ data: expect.objectContaining({ guildId: "guild_1", name: "Guild One", ownerId: "owner_1" }) });
    expect(result.team.guildId).toBe("guild_1");
    expect(result.member.role).toBe("MEMBER");
  });

  it("adds the Discord user automatically when they are not yet a team member", async () => {
    vi.mocked(prisma.team.findFirst).mockResolvedValue({ id: "team_1", name: "Guild Team", slug: "guild-team" } as never);
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(null as never);
    vi.mocked(prisma.teamMember.create).mockResolvedValue({ id: "member_1", teamId: "team_1", discordUserId: "user_1", displayName: "User", role: "MEMBER" } as never);

    const result = await resolveTeamContext({ guildId: "guild_1", discordUserId: "user_1", displayName: "User" });

    expect(prisma.teamMember.create).toHaveBeenCalled();
    expect(result.member.discordUserId).toBe("user_1");
  });

  it("directs DM users to a Discord server instead of selecting a team", async () => {
    await expect(resolveTeamContext({ guildId: null, discordUserId: "user_1" }))
      .rejects.toThrow("Discord 서버에서 TORO를 불러줘");
  });
});
