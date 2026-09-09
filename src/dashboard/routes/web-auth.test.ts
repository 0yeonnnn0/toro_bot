import express from "express";
import type { Server } from "http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createWebAuthRouter } from "./web-auth";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => server.close(err => err ? reject(err) : resolve()))));
});

async function startApp(router = createWebAuthRouter()) {
  const app = express();
  app.use("/api", router);
  const server: Server = await new Promise(resolve => {
    const instance = app.listen(0, () => resolve(instance));
  });
  servers.push(server);
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No address");
  return `http://127.0.0.1:${address.port}`;
}

describe("web Discord auth routes", () => {
  it("fails closed when Discord OAuth is not configured", async () => {
    const base = await startApp(createWebAuthRouter({ getConfig: () => null }));

    const response = await fetch(`${base}/api/auth/discord`, { redirect: "manual" });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login?error=oauth_unavailable");
  });

  it("creates a web session after a state-checked Discord callback", async () => {
    const base = await startApp(createWebAuthRouter({
      getConfig: () => ({ clientId: "app_1", clientSecret: "secret", redirectUri: "https://bot.example.com/api/auth/discord/callback" }),
      exchangeCode: vi.fn(async () => "access_token"),
      fetchIdentity: vi.fn(async () => ({ id: "user_1", username: "tester", global_name: "테스터" })),
      fetchGuilds: vi.fn(async () => [
        { id: "guild_1", name: "관리 서버", permissions: "32" },
        { id: "guild_2", name: "일반 서버", permissions: "0" },
      ]),
    }));

    const start = await fetch(`${base}/api/auth/discord`, { redirect: "manual" });
    const stateCookie = start.headers.get("set-cookie")?.split(";")[0];
    const authorizeUrl = new URL(start.headers.get("location")!);
    const callback = await fetch(`${base}/api/auth/discord/callback?code=code_1&state=${authorizeUrl.searchParams.get("state")}`, {
      redirect: "manual",
      headers: { cookie: stateCookie! },
    });
    const sessionCookie = callback.headers.get("set-cookie")?.split(";")[0];
    const session = await fetch(`${base}/api/auth/session`, { headers: { cookie: sessionCookie! } });

    expect(callback.status).toBe(302);
    expect(callback.headers.get("location")).toBe("/teams");
    expect(session.status).toBe(200);
    const sessionBody = await session.json();
    expect(sessionBody).toMatchObject({
      user: { id: "user_1", displayName: "테스터" },
    });
    expect(sessionBody).not.toHaveProperty("guilds");
  });

  it("rejects a callback whose state cookie does not match", async () => {
    const base = await startApp(createWebAuthRouter({
      getConfig: () => ({ clientId: "app_1", clientSecret: "secret", redirectUri: "https://bot.example.com/api/auth/discord/callback" }),
    }));

    const response = await fetch(`${base}/api/auth/discord/callback?code=code_1&state=wrong`, { redirect: "manual" });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/login?error=invalid_state");
  });
});
