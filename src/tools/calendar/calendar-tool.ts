import type { TeamRole } from "@prisma/client";
import { buildGoogleOAuthUrl, decryptToken, refreshGoogleAccessToken } from "./google-oauth";
import { getCalendarConnection } from "./calendar-store";

export function assertCanAdminCalendar(role: TeamRole): void {
  if (role !== "OWNER" && role !== "ADMIN") throw new Error("캘린더 연결/해제는 OWNER/ADMIN만 할 수 있다냥.");
}

export async function handleCalendarStatus(input: { teamId: string }): Promise<string> {
  const connection = await getCalendarConnection(input.teamId);
  if (!connection) return "연결된 캘린더가 없다냥. `/calendar connect`로 팀 캘린더를 연결해줘라냥.";
  return `팀 캘린더가 연결되어 있다냥: ${connection.googleAccountEmail ?? connection.calendarId}`;
}

export async function handleCalendarConnect(input: { teamId: string; role: TeamRole; connectedByDiscordUserId?: string }): Promise<string> {
  assertCanAdminCalendar(input.role);
  return `아래 링크로 Google Calendar를 연결해줘라냥:\n${buildGoogleOAuthUrl(input.teamId, input.connectedByDiscordUserId)}`;
}

function rangeToWindow(range: string): { timeMin: string; timeMax: string } {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);
  if (range.includes("오늘")) {
    start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999);
  } else {
    const day = now.getDay() || 7;
    start.setDate(now.getDate() - day + 1 + (range.includes("다음") ? 7 : 0));
    start.setHours(0, 0, 0, 0);
    end.setTime(start.getTime()); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59, 999);
  }
  return { timeMin: start.toISOString(), timeMax: end.toISOString() };
}

function parseEventDateTime(input: string): string {
  const parsed = new Date(input);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  const tomorrow = new Date();
  if (input.includes("내일")) tomorrow.setDate(tomorrow.getDate() + 1);
  const hour = input.match(/(오전|오후)?\s*(\d{1,2})시/);
  if (hour) {
    let h = Number(hour[2]);
    if (hour[1] === "오후" && h < 12) h += 12;
    tomorrow.setHours(h, 0, 0, 0);
  }
  return tomorrow.toISOString();
}

async function accessTokenForTeam(teamId: string) {
  const connection = await getCalendarConnection(teamId);
  if (!connection) return null;
  return { connection, accessToken: await refreshGoogleAccessToken(decryptToken(connection.encryptedRefreshToken)) };
}

export async function handleCalendarCreate(input: { teamId: string; title: string; startsAt: string; endsAt?: string; requestedByDiscordUserId: string }): Promise<string> {
  const auth = await accessTokenForTeam(input.teamId);
  if (!auth) return "아직 팀 캘린더가 연결되어 있지 않다냥. OWNER/ADMIN이 `/calendar connect`를 먼저 해줘라냥.";
  const startIso = parseEventDateTime(input.startsAt);
  const endIso = input.endsAt ? parseEventDateTime(input.endsAt) : new Date(new Date(startIso).getTime() + 60 * 60 * 1000).toISOString();
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(auth.connection.calendarId)}/events`, {
    method: "POST",
    headers: { authorization: `Bearer ${auth.accessToken}`, "content-type": "application/json" },
    body: JSON.stringify({ summary: input.title, start: { dateTime: startIso }, end: { dateTime: endIso } }),
  });
  if (!res.ok) throw new Error(`Google Calendar event create failed: ${res.status}`);
  return `일정 추가했다냥: ${input.title}`;
}

export async function handleCalendarList(input: { teamId: string; range: string }): Promise<string> {
  const auth = await accessTokenForTeam(input.teamId);
  if (!auth) return "아직 팀 캘린더가 연결되어 있지 않다냥. OWNER/ADMIN이 `/calendar connect`를 먼저 해줘라냥.";
  const { timeMin, timeMax } = rangeToWindow(input.range);
  const params = new URLSearchParams({ timeMin, timeMax, singleEvents: "true", orderBy: "startTime", maxResults: "10" });
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(auth.connection.calendarId)}/events?${params.toString()}`, { headers: { authorization: `Bearer ${auth.accessToken}` } });
  if (!res.ok) throw new Error(`Google Calendar list failed: ${res.status}`);
  const data = await res.json() as { items?: Array<{ summary?: string; start?: { dateTime?: string; date?: string } }> };
  const items = data.items ?? [];
  if (items.length === 0) return `${input.range} 일정이 없다냥.`;
  return `${input.range} 일정이다냥:\n${items.map((item, i) => `${i + 1}. ${item.start?.dateTime ?? item.start?.date ?? "시간 미정"} ${item.summary ?? "제목 없음"}`).join("\n")}`;
}
