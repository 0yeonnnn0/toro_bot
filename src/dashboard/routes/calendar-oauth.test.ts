import express from "express";
import type { Server } from "http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getGuild: vi.fn(),
  findTeam: vi.fn(),
  findMember: vi.fn(),
  exchangeCode: vi.fn(),
  upsertConnection: vi.fn(),
}));

vi.mock("../../bot/client", () => ({ client: { guilds: { cache: { get: mocks.getGuild } } } }));
vi.mock("../../db/client", () => ({
  prisma: {
    team: { findUnique: mocks.findTeam },
    teamMember: { findUnique: mocks.findMember },
  },
}));
vi.mock("../../tools/calendar/google-oauth", () => ({
  verifyGoogleOAuthState: vi.fn(() => ({ teamId: "team_1", connectedByDiscordUserId: "user_1" })),
  exchangeCodeForRefreshToken: mocks.exchangeCode,
}));
vi.mock("../../tools/calendar/calendar-store", () => ({ upsertCalendarConnection: mocks.upsertConnection }));

import calendarOAuthRouter from "./calendar-oauth";

const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))));
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.findMember.mockResolvedValue({ role: "OWNER" });
  mocks.exchangeCode.mockResolvedValue({ refresh_token: "refresh" });
});

async function startApp() {
  const app = express();
  app.use("/api", calendarOAuthRouter);
  const server: Server = await new Promise(resolve => {
    const instance = app.listen(0, () => resolve(instance));
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No address");
  return `http://127.0.0.1:${address.port}`;
}

describe("calendar OAuth callback authorization", () => {
  it("rejects a stale database owner after live Discord permission was revoked", async () => {
    const permissions = { has: vi.fn(() => false) };
    mocks.findTeam.mockResolvedValue({ id: "team_1", guildId: "guild_1" });
    mocks.getGuild.mockReturnValue({ ownerId: "owner_2", members: { fetch: vi.fn(async () => ({ permissions })) } });
    const base = await startApp();

    const response = await fetch(`${base}/api/calendar/oauth/callback?code=code_1&state=state_1`);

    expect(response.status).toBe(403);
    expect(mocks.exchangeCode).not.toHaveBeenCalled();
    expect(mocks.upsertConnection).not.toHaveBeenCalled();
  });

  it("allows the current Discord server owner", async () => {
    mocks.findTeam.mockResolvedValue({ id: "team_1", guildId: "guild_1" });
    mocks.getGuild.mockReturnValue({ ownerId: "user_1", members: { fetch: vi.fn() } });
    const base = await startApp();

    const response = await fetch(`${base}/api/calendar/oauth/callback?code=code_1&state=state_1`);

    expect(response.status).toBe(200);
    expect(mocks.upsertConnection).toHaveBeenCalledWith(expect.objectContaining({ teamId: "team_1", connectedByDiscordUserId: "user_1" }));
  });
});
