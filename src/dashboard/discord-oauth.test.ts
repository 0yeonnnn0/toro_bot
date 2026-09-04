import { afterEach, describe, expect, it } from "vitest";
import {
  buildDiscordAuthorizeUrl,
  canManageDiscordGuild,
  getDiscordOAuthConfig,
} from "./discord-oauth";

const ORIGINAL_ENV = { ...process.env };

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("Discord web OAuth", () => {
  it("requests identity and guild access with a state-bound callback", () => {
    const url = new URL(buildDiscordAuthorizeUrl({
      clientId: "app_1",
      clientSecret: "secret",
      redirectUri: "https://bot.example.com/api/auth/discord/callback",
    }, "state_1"));

    expect(url.origin + url.pathname).toBe("https://discord.com/oauth2/authorize");
    expect(url.searchParams.get("client_id")).toBe("app_1");
    expect(url.searchParams.get("scope")).toBe("identify guilds");
    expect(url.searchParams.get("state")).toBe("state_1");
  });

  it("recognizes server owners and Manage Guild permission", () => {
    expect(canManageDiscordGuild({ owner: true, permissions: "0" })).toBe(true);
    expect(canManageDiscordGuild({ owner: false, permissions: "32" })).toBe(true);
    expect(canManageDiscordGuild({ owner: false, permissions: "0" })).toBe(false);
  });

  it("uses the public TORO URL for the callback", () => {
    process.env.DISCORD_CLIENT_ID = "app_1";
    process.env.DISCORD_CLIENT_SECRET = "secret";
    process.env.TORO_PUBLIC_URL = "https://bot.example.com/";
    delete process.env.DISCORD_REDIRECT_URI;

    expect(getDiscordOAuthConfig()).toEqual({
      clientId: "app_1",
      clientSecret: "secret",
      redirectUri: "https://bot.example.com/api/auth/discord/callback",
    });
  });
});
