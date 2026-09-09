import { Router } from "express";
import {
  buildDiscordAuthorizeUrl,
  canManageDiscordGuild,
  consumeDiscordOAuthState,
  createDiscordOAuthState,
  createDiscordWebSession,
  deleteDiscordWebSession,
  exchangeDiscordCode,
  fetchDiscordGuilds,
  fetchDiscordIdentity,
  getDiscordOAuthConfig,
  getDiscordWebSession,
  readCookie,
  type DiscordOAuthConfig,
} from "../discord-oauth";

const OAUTH_STATE_COOKIE = "toro_oauth_state";
export const WEB_SESSION_COOKIE = "toro_user_sid";

interface WebAuthDependencies {
  getConfig: () => DiscordOAuthConfig | null;
  exchangeCode: typeof exchangeDiscordCode;
  fetchIdentity: typeof fetchDiscordIdentity;
  fetchGuilds: typeof fetchDiscordGuilds;
}

const defaultDependencies: WebAuthDependencies = {
  getConfig: getDiscordOAuthConfig,
  exchangeCode: exchangeDiscordCode,
  fetchIdentity: fetchDiscordIdentity,
  fetchGuilds: fetchDiscordGuilds,
};

function cookieOptions(secure: boolean, maxAge: number) {
  return { httpOnly: true, sameSite: "lax" as const, secure, maxAge, path: "/" };
}

export function createWebAuthRouter(overrides: Partial<WebAuthDependencies> = {}): Router {
  const router = Router();
  const deps = { ...defaultDependencies, ...overrides };

  router.get("/auth/discord", (_req, res) => {
    const config = deps.getConfig();
    if (!config) return res.redirect("/login?error=oauth_unavailable");

    const state = createDiscordOAuthState();
    res.cookie(OAUTH_STATE_COOKIE, state, cookieOptions(config.redirectUri.startsWith("https://"), 10 * 60 * 1000));
    return res.redirect(buildDiscordAuthorizeUrl(config, state));
  });

  router.get("/auth/discord/callback", async (req, res) => {
    const config = deps.getConfig();
    if (!config) return res.redirect("/login?error=oauth_unavailable");

    const code = String(req.query.code || "");
    const state = String(req.query.state || "");
    const cookieState = readCookie(req.headers.cookie, OAUTH_STATE_COOKIE);
    if (!code || !state || state !== cookieState || !consumeDiscordOAuthState(state)) {
      return res.redirect("/login?error=invalid_state");
    }

    try {
      const accessToken = await deps.exchangeCode(code, config);
      const [user, guilds] = await Promise.all([
        deps.fetchIdentity(accessToken),
        deps.fetchGuilds(accessToken),
      ]);
      const manageableGuilds = guilds.filter(canManageDiscordGuild);
      const sessionId = createDiscordWebSession(user, manageableGuilds);
      res.cookie(WEB_SESSION_COOKIE, sessionId, cookieOptions(config.redirectUri.startsWith("https://"), 7 * 24 * 60 * 60 * 1000));
      return res.redirect("/teams");
    } catch (err) {
      console.error(`[Discord OAuth] ${(err as Error).message}`);
      return res.redirect("/login?error=oauth_failed");
    }
  });

  router.get("/auth/session", (req, res) => {
    const session = getDiscordWebSession(readCookie(req.headers.cookie, WEB_SESSION_COOKIE));
    if (!session) return res.status(401).json({ error: "unauthorized" });
    const displayName = session.user.global_name || session.user.username;
    const avatarUrl = session.user.avatar
      ? `https://cdn.discordapp.com/avatars/${session.user.id}/${session.user.avatar}.png?size=128`
      : null;
    return res.json({ user: { id: session.user.id, displayName, avatarUrl } });
  });

  router.post("/auth/logout", (req, res) => {
    deleteDiscordWebSession(readCookie(req.headers.cookie, WEB_SESSION_COOKIE));
    res.clearCookie(WEB_SESSION_COOKIE, { path: "/" });
    return res.json({ ok: true });
  });

  return router;
}

export default createWebAuthRouter();
