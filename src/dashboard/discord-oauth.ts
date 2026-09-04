import crypto from "crypto";

const DISCORD_API_BASE = "https://discord.com/api/v10";
const MANAGE_GUILD = 1n << 5n;
const ADMINISTRATOR = 1n << 3n;
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const STATE_TTL_MS = 10 * 60 * 1000;

export interface DiscordOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface DiscordIdentity {
  id: string;
  username: string;
  global_name?: string | null;
  avatar?: string | null;
}

export interface DiscordGuildSummary {
  id: string;
  name: string;
  icon?: string | null;
  owner?: boolean;
  permissions: string;
}

export interface DiscordWebSession {
  user: DiscordIdentity;
  guilds: DiscordGuildSummary[];
  expiresAt: number;
}

const oauthStates = new Map<string, number>();
const sessions = new Map<string, DiscordWebSession>();

function publicBaseUrl(): string {
  return (process.env.TORO_PUBLIC_URL || process.env.PUBLIC_BASE_URL || process.env.DASHBOARD_PUBLIC_URL || "")
    .replace(/\/$/, "");
}

export function getDiscordOAuthConfig(): DiscordOAuthConfig | null {
  const clientId = process.env.DISCORD_CLIENT_ID || "";
  const clientSecret = process.env.DISCORD_CLIENT_SECRET || "";
  const redirectUri = process.env.DISCORD_REDIRECT_URI
    || (publicBaseUrl() ? `${publicBaseUrl()}/api/auth/discord/callback` : "http://localhost:3000/api/auth/discord/callback");
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret, redirectUri };
}

export function buildDiscordAuthorizeUrl(config: DiscordOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    response_type: "code",
    redirect_uri: config.redirectUri,
    scope: "identify guilds",
    state,
  });
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

export function canManageDiscordGuild(guild: Pick<DiscordGuildSummary, "owner" | "permissions">): boolean {
  if (guild.owner) return true;
  try {
    const permissions = BigInt(guild.permissions || "0");
    return (permissions & MANAGE_GUILD) === MANAGE_GUILD || (permissions & ADMINISTRATOR) === ADMINISTRATOR;
  } catch {
    return false;
  }
}

export function createDiscordOAuthState(now = Date.now()): string {
  const state = crypto.randomBytes(24).toString("base64url");
  oauthStates.set(state, now + STATE_TTL_MS);
  return state;
}

export function consumeDiscordOAuthState(state: string, now = Date.now()): boolean {
  const expiresAt = oauthStates.get(state);
  oauthStates.delete(state);
  return typeof expiresAt === "number" && expiresAt >= now;
}

export async function exchangeDiscordCode(code: string, config: DiscordOAuthConfig): Promise<string> {
  const response = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: config.redirectUri,
    }),
  });
  if (!response.ok) throw new Error(`Discord OAuth token exchange failed: ${response.status}`);
  const data = await response.json() as { access_token?: string };
  if (!data.access_token) throw new Error("Discord OAuth response did not include an access token");
  return data.access_token;
}

async function discordGet<T>(path: string, accessToken: string): Promise<T> {
  const response = await fetch(`${DISCORD_API_BASE}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) throw new Error(`Discord API request failed: ${response.status}`);
  return await response.json() as T;
}

export async function fetchDiscordIdentity(accessToken: string): Promise<DiscordIdentity> {
  return discordGet<DiscordIdentity>("/users/@me", accessToken);
}

export async function fetchDiscordGuilds(accessToken: string): Promise<DiscordGuildSummary[]> {
  return discordGet<DiscordGuildSummary[]>("/users/@me/guilds", accessToken);
}

export function createDiscordWebSession(user: DiscordIdentity, guilds: DiscordGuildSummary[], now = Date.now()): string {
  const sessionId = crypto.randomUUID();
  sessions.set(sessionId, { user, guilds, expiresAt: now + SESSION_TTL_MS });
  return sessionId;
}

export function getDiscordWebSession(sessionId: string | undefined, now = Date.now()): DiscordWebSession | null {
  if (!sessionId) return null;
  const session = sessions.get(sessionId);
  if (!session || session.expiresAt < now) {
    sessions.delete(sessionId);
    return null;
  }
  return session;
}

export function deleteDiscordWebSession(sessionId: string | undefined): void {
  if (sessionId) sessions.delete(sessionId);
}

export function readCookie(cookieHeader: string | undefined, name: string): string | undefined {
  if (!cookieHeader) return undefined;
  for (const item of cookieHeader.split(";")) {
    const [key, ...value] = item.trim().split("=");
    if (key === name) return decodeURIComponent(value.join("="));
  }
  return undefined;
}
