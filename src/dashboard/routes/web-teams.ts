import { PermissionFlagsBits } from "discord.js";
import { Router, type Request } from "express";
import { client } from "../../bot/client";
import { prisma } from "../../db/client";
import { resolveTeamContext } from "../../team/context";
import { getDiscordWebSession, readCookie, type DiscordGuildSummary, type DiscordWebSession } from "../discord-oauth";
import { WEB_SESSION_COOKIE } from "./web-auth";

const router = Router();

function sessionFor(req: Request): DiscordWebSession | null {
  return getDiscordWebSession(readCookie(req.headers.cookie, WEB_SESSION_COOKIE));
}

function iconUrl(guild: DiscordGuildSummary): string | null {
  return guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=128` : null;
}

async function hasLiveManagementPermission(
  guild: NonNullable<ReturnType<typeof client.guilds.cache.get>>,
  userId: string,
): Promise<boolean> {
  if (guild.ownerId === userId) return true;
  try {
    const member = await guild.members.fetch(userId);
    return member.permissions.has(PermissionFlagsBits.ManageGuild);
  } catch {
    return false;
  }
}

async function requireManagedBotGuild(req: Request, guildId: string) {
  const session = sessionFor(req);
  if (!session) return { error: 401 as const, message: "Discord 로그인이 필요하다냥." };
  const oauthGuild = session.guilds.find(guild => guild.id === guildId);
  if (!oauthGuild) return { error: 403 as const, message: "이 서버를 관리할 권한이 없다냥." };

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return { error: 409 as const, message: "이 서버에 TORO를 먼저 추가해줘라냥." };

  if (!await hasLiveManagementPermission(guild, session.user.id)) {
    return { error: 403 as const, message: "Discord 서버 관리 권한이 필요하다냥." };
  }

  return { session, oauthGuild, guild };
}

async function teamMembers(teamId: string) {
  return prisma.teamMember.findMany({
    where: { teamId },
    select: { discordUserId: true, displayName: true, role: true, createdAt: true },
    orderBy: [{ role: "asc" }, { createdAt: "asc" }],
  });
}

router.get("/account/guilds", async (req, res) => {
  const session = sessionFor(req);
  if (!session) return res.status(401).json({ error: "Discord 로그인이 필요하다냥." });

  const verifiedGuilds = (await Promise.all(session.guilds.map(async oauthGuild => {
    const guild = client.guilds.cache.get(oauthGuild.id);
    if (!guild) return { oauthGuild, guild: null };
    return await hasLiveManagementPermission(guild, session.user.id) ? { oauthGuild, guild } : null;
  }))).filter(item => item !== null);
  const guildIds = verifiedGuilds.flatMap(item => item.guild ? [item.oauthGuild.id] : []);
  const teams = guildIds.length === 0 ? [] : await prisma.team.findMany({
    where: { guildId: { in: guildIds } },
    select: {
      id: true,
      guildId: true,
      name: true,
      slug: true,
      _count: { select: { members: true } },
      calendar: { select: { id: true } },
    },
  });
  const teamByGuildId = new Map(teams.map(team => [team.guildId, team]));

  return res.json({
    guilds: verifiedGuilds.map(({ oauthGuild: guild, guild: liveGuild }) => {
      const team = liveGuild ? teamByGuildId.get(guild.id) : undefined;
      return {
        id: guild.id,
        name: guild.name,
        icon: iconUrl(guild),
        botInstalled: Boolean(liveGuild),
        team: team ? {
          id: team.id,
          name: team.name,
          slug: team.slug,
          memberCount: team._count.members,
          calendarConnected: Boolean(team.calendar),
        } : null,
      };
    }),
  });
});

router.post("/account/guilds/:guildId/team", async (req, res) => {
  const access = await requireManagedBotGuild(req, String(req.params.guildId));
  if ("error" in access && access.error) return res.status(access.error).json({ error: access.message });

  const displayName = access.session.user.global_name || access.session.user.username;
  const { team, member } = await resolveTeamContext({
    guildId: access.guild.id,
    guildName: access.guild.name,
    guildOwnerId: access.guild.ownerId,
    discordUserId: access.session.user.id,
    displayName,
    canManageGuild: true,
  });

  if (team.name !== access.guild.name) {
    await prisma.team.update({ where: { id: team.id }, data: { name: access.guild.name } });
  }

  return res.json({
    team: {
      id: team.id,
      name: access.guild.name,
      slug: team.slug,
      guildId: team.guildId,
      role: member.role,
      members: await teamMembers(team.id),
    },
  });
});

router.get("/account/guilds/:guildId/team", async (req, res) => {
  const access = await requireManagedBotGuild(req, String(req.params.guildId));
  if ("error" in access && access.error) return res.status(access.error).json({ error: access.message });

  const team = await prisma.team.findFirst({
    where: { guildId: access.guild.id },
    select: { id: true, name: true, slug: true, guildId: true },
  });
  if (!team) return res.status(404).json({ error: "아직 생성된 TORO 팀이 없다냥." });

  const membership = await prisma.teamMember.findMany({
    where: { teamId: team.id, discordUserId: access.session.user.id },
    select: { role: true },
    take: 1,
  });
  return res.json({
    team: {
      ...team,
      role: membership[0]?.role || "ADMIN",
      members: await teamMembers(team.id),
    },
  });
});

export default router;
