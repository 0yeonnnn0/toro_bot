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
      update: vi.fn(),
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

  it("promotes a live Discord server manager to team admin", async () => {
    const team = { id: "team_1", name: "Guild Team", slug: "guild-team", guildId: "guild_1", ownerId: "owner_1" };
    const member = { id: "member_1", teamId: "team_1", discordUserId: "user_1", displayName: "User", role: "MEMBER" };
    vi.mocked(prisma.team.findFirst).mockResolvedValue(team as never);
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(member as never);
    vi.mocked(prisma.teamMember.update).mockResolvedValue({ ...member, role: "ADMIN" } as never);

    const result = await resolveTeamContext({ guildId: "guild_1", discordUserId: "user_1", displayName: "User", canManageGuild: true });

    expect(prisma.teamMember.update).toHaveBeenCalledWith({ where: { id: "member_1" }, data: { role: "ADMIN" } });
    expect(result.member.role).toBe("ADMIN");
  });

  it("makes the current Discord owner authoritative and removes stale team admin access", async () => {
    const team = { id: "team_1", name: "Guild Team", slug: "guild-team", guildId: "guild_1", ownerId: "user_1" };
    const syncedTeam = { ...team, ownerId: "owner_2" };
    const member = { id: "member_1", teamId: "team_1", discordUserId: "user_1", displayName: "User", role: "OWNER" };
    vi.mocked(prisma.team.findFirst).mockResolvedValue(team as never);
    vi.mocked(prisma.team.update).mockResolvedValue(syncedTeam as never);
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(member as never);
    vi.mocked(prisma.teamMember.update).mockResolvedValue({ ...member, role: "MEMBER" } as never);

    const result = await resolveTeamContext({ guildId: "guild_1", guildOwnerId: "owner_2", discordUserId: "user_1", displayName: "User", canManageGuild: false });

    expect(prisma.team.update).toHaveBeenCalledWith({ where: { id: "team_1" }, data: { ownerId: "owner_2" } });
    expect(prisma.teamMember.update).toHaveBeenCalledWith({ where: { id: "member_1" }, data: { role: "MEMBER" } });
    expect(result.member.role).toBe("MEMBER");
  });

  it("demotes a former server owner who still has Manage Server permission to admin", async () => {
    const team = { id: "team_1", name: "Guild Team", slug: "guild-team", guildId: "guild_1", ownerId: "owner_2" };
    const member = { id: "member_1", teamId: "team_1", discordUserId: "user_1", displayName: "User", role: "OWNER" };
    vi.mocked(prisma.team.findFirst).mockResolvedValue(team as never);
    vi.mocked(prisma.teamMember.findUnique).mockResolvedValue(member as never);
    vi.mocked(prisma.teamMember.update).mockResolvedValue({ ...member, role: "ADMIN" } as never);

    const result = await resolveTeamContext({ guildId: "guild_1", guildOwnerId: "owner_2", discordUserId: "user_1", canManageGuild: true });

    expect(prisma.teamMember.update).toHaveBeenCalledWith({ where: { id: "member_1" }, data: { role: "ADMIN" } });
    expect(result.member.role).toBe("ADMIN");
  });

  it("directs DM users to a Discord server instead of selecting a team", async () => {
    vi.mocked(prisma.teamMember.findMany).mockResolvedValue([]);
    await expect(resolveTeamContext({ guildId: null, discordUserId: "user_1" }))
      .rejects.toThrow("Discord 서버에서 TORO를 불러줘");
  });

  it("keeps one existing guild-less team accessible in DM without allowing new DM teams", async () => {
    const team = { id: "legacy_1", name: "기존 DM 팀", slug: "legacy", guildId: null, ownerId: "user_1" };
    const member = { id: "member_1", teamId: team.id, discordUserId: "user_1", displayName: "User", role: "OWNER", team };
    vi.mocked(prisma.teamMember.findMany).mockResolvedValue([member] as never);

    const result = await resolveTeamContext({ guildId: null, discordUserId: "user_1" });

    expect(result).toEqual({ team, member });
    expect(prisma.teamMember.findMany).toHaveBeenCalledWith({
      where: { discordUserId: "user_1", team: { guildId: null } },
      include: { team: true },
    });
  });
});
