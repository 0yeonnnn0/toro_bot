import crypto from "crypto";
import fs from "fs";
import path from "path";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function getPublicBaseUrl(): string {
  const raw = process.env.TORO_PUBLIC_URL || process.env.PUBLIC_BASE_URL || process.env.DASHBOARD_PUBLIC_URL || "";
  return raw.replace(/\/$/, "");
}

function getCalendarRedirectUri(): string {
  if (process.env.GOOGLE_REDIRECT_URI) return process.env.GOOGLE_REDIRECT_URI;
  const base = getPublicBaseUrl();
  if (base) return `${base}/api/calendar/oauth/callback`;
  return "http://localhost:3000/api/calendar/oauth/callback";
}

function requireGoogleOAuthConfig(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || "";
  const redirectUri = getCalendarRedirectUri();
  if (!clientId || !clientSecret) {
    throw new Error("Google Calendar OAuth 설정이 필요하다냥. GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET을 설정해줘라냥.");
  }
  if (process.env.NODE_ENV === "production" && redirectUri.includes("localhost")) {
    throw new Error("Google Calendar OAuth callback URL이 localhost다냥. 운영에서는 TORO_PUBLIC_URL 또는 GOOGLE_REDIRECT_URI를 NAS 외부 HTTPS 주소로 설정해줘라냥.");
  }
  return { clientId, clientSecret, redirectUri };
}

function keyFilePath(): string {
  return process.env.TOKEN_ENCRYPTION_KEY_FILE || path.join(process.cwd(), "data", "token-encryption.key");
}

function readOrCreateKeyFile(): string | null {
  const file = keyFilePath();
  try {
    if (fs.existsSync(file)) return fs.readFileSync(file, "utf8").trim();
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const generated = crypto.randomBytes(32).toString("hex");
    fs.writeFileSync(file, generated + "\n", { mode: 0o600 });
    try { fs.chmodSync(file, 0o600); } catch { /* best effort */ }
    console.warn(`[Calendar] Generated TOKEN_ENCRYPTION_KEY_FILE at ${file}`);
    return generated;
  } catch (err) {
    console.warn(`[Calendar] Could not read/create TOKEN_ENCRYPTION_KEY_FILE: ${(err as Error).message}`);
    return null;
  }
}

function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY || (process.env.NODE_ENV === "production" ? readOrCreateKeyFile() || "" : "");
  if (!raw && process.env.NODE_ENV === "production") throw new Error("TOKEN_ENCRYPTION_KEY is required in production and TOKEN_ENCRYPTION_KEY_FILE could not be created");
  if (raw.length === 32) return Buffer.from(raw);
  return crypto.createHash("sha256").update(raw || "dev-only-token-encryption-key").digest();
}

export function encryptToken(token: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(token, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("base64"), tag.toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptToken(value: string): string {
  const [ivRaw, tagRaw, encryptedRaw] = value.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), Buffer.from(ivRaw, "base64"));
  decipher.setAuthTag(Buffer.from(tagRaw, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedRaw, "base64")), decipher.final()]).toString("utf8");
}

function signStatePayload(payload: string): string {
  return crypto.createHmac("sha256", getKey()).update(payload).digest("base64url");
}

export function buildGoogleOAuthState(teamId: string, connectedByDiscordUserId = "unknown", issuedAt = Date.now()): string {
  const payload = Buffer.from(JSON.stringify({ teamId, connectedByDiscordUserId, issuedAt }), "utf8").toString("base64url");
  return `${payload}.${signStatePayload(payload)}`;
}

export function verifyGoogleOAuthState(state: string, now = Date.now()): { teamId: string; connectedByDiscordUserId: string; issuedAt: number } {
  const [payload, signature] = state.split(".");
  if (!payload || !signature) throw new Error("Invalid Google OAuth state");
  const expected = signStatePayload(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new Error("Invalid Google OAuth state signature");
  const parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { teamId?: string; connectedByDiscordUserId?: string; issuedAt?: number };
  if (!parsed.teamId || !parsed.connectedByDiscordUserId || typeof parsed.issuedAt !== "number") throw new Error("Invalid Google OAuth state payload");
  if (now - parsed.issuedAt > OAUTH_STATE_TTL_MS) throw new Error("Expired Google OAuth state");
  return { teamId: parsed.teamId, connectedByDiscordUserId: parsed.connectedByDiscordUserId, issuedAt: parsed.issuedAt };
}

export function buildGoogleOAuthUrl(teamId: string, connectedByDiscordUserId = "unknown"): string {
  const clientId = process.env.GOOGLE_CLIENT_ID || "";
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/calendar/oauth/callback";
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar",
    access_type: "offline",
    prompt: "consent",
    state: buildGoogleOAuthState(teamId, connectedByDiscordUserId),
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeCodeForRefreshToken(code: string) {
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || "http://localhost:3000/api/calendar/oauth/callback";
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) throw new Error(`Google OAuth token exchange failed: ${res.status}`);
  return await res.json() as { access_token: string; refresh_token?: string; expires_in?: number };
}

export async function refreshGoogleAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID || "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET || "",
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) throw new Error(`Google OAuth refresh failed: ${res.status}`);
  const data = await res.json() as { access_token: string };
  return data.access_token;
}
