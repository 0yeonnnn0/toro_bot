import crypto from "crypto";

function getKey(): Buffer {
  const raw = process.env.TOKEN_ENCRYPTION_KEY || "";
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
    state: `${teamId}:${connectedByDiscordUserId}`,
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
