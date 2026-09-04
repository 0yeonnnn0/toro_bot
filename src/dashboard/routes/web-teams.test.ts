import express from "express";
import type { Server } from "http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getGuild: vi.fn(),
  findManyTeams: vi.fn(),
  findFirstTeam: vi.fn(),
  updateTeam: vi.fn(),
  findManyMembers: vi.fn(),
  resolveTeamContext: vi.fn(),
}));

vi.mock("../../bot/client", () => ({
  client: { guilds: { cache: { get: mocks.getGuild } } },
}));

vi.mock("../../db/client", () => ({
  prisma: {
    team: {
      findMany: mocks.findManyTeams,
      findFirst: mocks.findFirstTeam,
      update: mocks.updateTeam,
    },
    teamMember: { findMany: mocks.findManyMembers },
  },
}));

vi.mock("../../team/context", () => ({ resolveTeamContext: mocks.resolveTeamContext }));

import { createDiscordWebSession } from "../discord-oauth";
import webTeamsRouter from "./web-teams";
import { WEB_SESSION_COOKIE } from "./web-auth";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()))));
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findManyTeams.mockResolvedValue([]);
  mocks.findManyMembers.mockResolvedValue([]);
});

async function startApp() {
  const app = express();
  app.use(express.json());
  app.use("/api", webTeamsRouter);
  const server: Server = await new Promise(resolve => {
    const instance = app.listen(0, () => resolve(instance));
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No address");
  return `http://127.0.0.1:${address.port}`;
}

function sessionCookie() {
  const id = createDiscordWebSession(
    { id: "user_1", username: "tester", global_name: "테스터" },
    [
      { id: "guild_1", name: "토로 연구소", permissions: "32" },
      { id: "guild_2", name: "미설치 서버", permissions: "32" },
    ],
  );
  return `${WEB_SESSION_COOKIE}=${id}`;
}

describe("web team routes", () => {
  it("requires a Discord web session", async () => {
    const base = await startApp();

    const response = await fetch(`${base}/api/account/guilds`);

    expect(response.status).toBe(401);
  });

  it("lists manageable servers with bot and team state", async () => {
    mocks.getGuild.mockImplementation((id: string) => id === "guild_1" ? { id, name: "토로 연구소" } : undefined);
    mocks.findManyTeams.mockResolvedValue([{ id: "team_1", guildId: "guild_1", name: "토로 연구소", slug: "discord-guild_1", _count: { members: 3 }, calendar: { id: "calendar_1" } }]);
    const base = await startApp();

    const response = await fetch(`${base}/api/account/guilds`, { headers: { cookie: sessionCookie() } });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ guilds: [
      { id: "guild_1", name: "토로 연구소", icon: null, botInstalled: true, team: { id: "team_1", name: "토로 연구소", slug: "discord-guild_1", memberCount: 3, calendarConnected: true } },
      { id: "guild_2", name: "미설치 서버", icon: null, botInstalled: false, team: null },
    ] });
  });

  it("checks live Discord permissions before provisioning a team", async () => {
    const permissions = { has: vi.fn(() => true) };
    mocks.getGuild.mockReturnValue({ id: "guild_1", name: "토로 연구소", ownerId: "owner_1", members: { fetch: vi.fn(async () => ({ permissions })) } });
    mocks.resolveTeamContext.mockResolvedValue({
      team: { id: "team_1", guildId: "guild_1", name: "토로 연구소", slug: "discord-guild_1" },
      member: { role: "ADMIN" },
    });
    mocks.findManyMembers.mockResolvedValue([{ discordUserId: "user_1", displayName: "테스터", role: "ADMIN", createdAt: new Date("2026-09-03T00:00:00.000Z") }]);
    const base = await startApp();

    const response = await fetch(`${base}/api/account/guilds/guild_1/team`, {
      method: "POST",
      headers: { cookie: sessionCookie() },
    });

    expect(response.status).toBe(200);
    expect(mocks.resolveTeamContext).toHaveBeenCalledWith(expect.objectContaining({
      guildId: "guild_1",
      guildOwnerId: "owner_1",
      discordUserId: "user_1",
      canManageGuild: true,
    }));
    await expect(response.json()).resolves.toMatchObject({ team: { id: "team_1", role: "ADMIN", members: [{ displayName: "테스터", role: "ADMIN" }] } });
  });

  it("rejects management when the bot is not installed", async () => {
    mocks.getGuild.mockReturnValue(undefined);
    const base = await startApp();

    const response = await fetch(`${base}/api/account/guilds/guild_1/team`, {
      method: "POST",
      headers: { cookie: sessionCookie() },
    });

    expect(response.status).toBe(409);
  });
});
