import { Router } from "express";
import { exchangeCodeForRefreshToken, verifyGoogleOAuthState } from "../../tools/calendar/google-oauth";
import { upsertCalendarConnection } from "../../tools/calendar/calendar-store";
import { prisma } from "../../db/client";

const router = Router();

router.get("/calendar/oauth/callback", async (req, res) => {
  try {
    const code = String(req.query.code || "");
    const state = String(req.query.state || "");
    if (!code || !state) return res.status(400).send("Missing Google OAuth code/state");
    const { teamId, connectedByDiscordUserId } = verifyGoogleOAuthState(state);
    const member = await prisma.teamMember.findUnique({ where: { teamId_discordUserId: { teamId, discordUserId: connectedByDiscordUserId } } });
    if (!member || (member.role !== "OWNER" && member.role !== "ADMIN")) return res.status(403).send("Calendar OAuth requires team OWNER/ADMIN");
    const token = await exchangeCodeForRefreshToken(code);
    if (!token.refresh_token) return res.status(400).send("No refresh token returned. Retry with /calendar connect.");
    await upsertCalendarConnection({ teamId, calendarId: "primary", refreshToken: token.refresh_token, connectedByDiscordUserId });
    res.send("TORO 팀 캘린더 연결이 완료됐다냥. Discord로 돌아가도 된다냥.");
  } catch (err) {
    res.status(500).send(`Calendar OAuth failed: ${(err as Error).message}`);
  }
});

export default router;
