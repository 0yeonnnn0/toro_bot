import { Router } from "express";
import { exchangeCodeForRefreshToken } from "../../tools/calendar/google-oauth";
import { upsertCalendarConnection } from "../../tools/calendar/calendar-store";

const router = Router();

router.get("/calendar/oauth/callback", async (req, res) => {
  try {
    const code = String(req.query.code || "");
    const state = String(req.query.state || "");
    const [teamId, connectedByDiscordUserId = "unknown"] = state.split(":");
    if (!code || !teamId) return res.status(400).send("Missing Google OAuth code/state");
    const token = await exchangeCodeForRefreshToken(code);
    if (!token.refresh_token) return res.status(400).send("No refresh token returned. Retry with /calendar connect.");
    await upsertCalendarConnection({ teamId, calendarId: "primary", refreshToken: token.refresh_token, connectedByDiscordUserId });
    res.send("TORO 팀 캘린더 연결이 완료됐다냥. Discord로 돌아가도 된다냥.");
  } catch (err) {
    res.status(500).send(`Calendar OAuth failed: ${(err as Error).message}`);
  }
});

export default router;
