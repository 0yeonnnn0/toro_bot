import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db/team-store", () => ({
  addTeamMember: vi.fn(),
  createTeam: vi.fn(),
  createTeamInvite: vi.fn(),
  getInviteByCode: vi.fn(),
  getMembershipsForUser: vi.fn(),
  getTeamMembers: vi.fn(),
  markInviteUsed: vi.fn(),
}));

import {
  buildLoginStatusMessage,
  handleLogin,
  handleTeamCreate,
  handleTeamInfo,
  makeTeamSlug,
} from "./team";
import { createTeam, getMembershipsForUser } from "../../db/team-store";

function fakeInteraction(commandOptions: Record<string, string> = {}) {
  return {
    user: { id: "user_1", displayName: "Owner" },
    guildId: "guild_1",
    reply: vi.fn(),
    options: {
      getString: vi.fn((name: string, required?: boolean) => {
        const value = commandOptions[name];
        if (required && !value) throw new Error(`Missing ${name}`);
        return value ?? null;
      }),
      getSubcommand: vi.fn(() => commandOptions.subcommand),
    },
  } as any;
}

describe("team commands", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates URL-safe team slugs from Korean and English names", () => {
    expect(makeTeamSlug("My Team!!")).toBe("my-team");
    expect(makeTeamSlug("토로 팀")).toBe("토로-팀");
  });

  it("builds login guidance when the user has no memberships", () => {
    expect(buildLoginStatusMessage([])).toContain("아직 가입한 TORO 팀이 없다냥");
  });

  it("builds login status with joined teams", () => {
    const msg = buildLoginStatusMessage([
      { role: "OWNER", team: { name: "Alpha", slug: "alpha" } },
      { role: "MEMBER", team: { name: "Beta", slug: "beta" } },
    ] as any);

    expect(msg).toContain("Alpha");
    expect(msg).toContain("Beta");
  });

  it("/login replies with membership status", async () => {
    vi.mocked(getMembershipsForUser).mockResolvedValue([{ role: "OWNER", team: { name: "Alpha", slug: "alpha" } }] as never);
    const interaction = fakeInteraction();

    await handleLogin(interaction);

    expect(getMembershipsForUser).toHaveBeenCalledWith("user_1");
    expect(interaction.reply).toHaveBeenCalledWith({ content: expect.stringContaining("Alpha"), ephemeral: true });
  });

  it("/team create creates a guild team owned by caller", async () => {
    vi.mocked(createTeam).mockResolvedValue({ id: "team_1", name: "Alpha", slug: "alpha" } as never);
    const interaction = fakeInteraction({ name: "Alpha" });

    await handleTeamCreate(interaction);

    expect(createTeam).toHaveBeenCalledWith({
      name: "Alpha",
      slug: "alpha",
      guildId: "guild_1",
      ownerDiscordUserId: "user_1",
      ownerDisplayName: "Owner",
    });
    expect(interaction.reply).toHaveBeenCalledWith({ content: expect.stringContaining("Alpha"), ephemeral: true });
  });

  it("/team info explains when the user has no teams", async () => {
    vi.mocked(getMembershipsForUser).mockResolvedValue([] as never);
    const interaction = fakeInteraction();

    await handleTeamInfo(interaction);

    expect(interaction.reply).toHaveBeenCalledWith({ content: expect.stringContaining("아직 가입한 TORO 팀이 없다냥"), ephemeral: true });
  });
});
