import { PermissionFlagsBits } from "discord.js";
import { Router } from "express";
import { client } from "../../bot/client";
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
    const team = await prisma.team.findUnique({ where: { id: teamId }, select: { guildId: true } });
    const member = await prisma.teamMember.findUnique({ where: { teamId_discordUserId: { teamId, discordUserId: connectedByDiscordUserId } } });
    if (!team || !member) return res.status(403).send("Calendar OAuth requires team membership");
    if (team.guildId) {
      const guild = client.guilds.cache.get(team.guildId);
      if (!guild) return res.status(403).send("Calendar OAuth requires an installed Discord server");
      let canManage = guild.ownerId === connectedByDiscordUserId;
      if (!canManage) {
        try {
          const discordMember = await guild.members.fetch(connectedByDiscordUserId);
          canManage = discordMember.permissions.has(PermissionFlagsBits.ManageGuild);
        } catch {
          canManage = false;
        }
      }
      if (!canManage) return res.status(403).send("Calendar OAuth requires live Discord Manage Server permission");
    } else if (member.role !== "OWNER" && member.role !== "ADMIN") {
      return res.status(403).send("Calendar OAuth requires legacy team OWNER/ADMIN");
    }
    const token = await exchangeCodeForRefreshToken(code);
    if (!token.refresh_token) return res.status(400).send("No refresh token returned. Retry with /calendar connect.");
    await upsertCalendarConnection({ teamId, calendarId: "primary", refreshToken: token.refresh_token, connectedByDiscordUserId });
    res.send("TORO 팀 캘린더 연결이 완료됐다냥. Discord로 돌아가도 된다냥.");
  } catch (err) {
    res.status(500).send(`Calendar OAuth failed: ${(err as Error).message}`);
  }
});

export default router;
