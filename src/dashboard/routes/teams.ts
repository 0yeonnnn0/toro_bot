import { Router } from "express";
import { prisma } from "../../db/client";

const router = Router();

export async function getTeamsOverview() {
  try {
    const [teams, members, memos, calendars] = await Promise.all([
      prisma.team.count(),
      prisma.teamMember.count(),
      prisma.memo.count(),
      prisma.teamCalendarConnection.count(),
    ]);
    const recentTeams = await prisma.team.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { _count: { select: { members: true, memos: true } }, calendar: true },
    });
    return { db: { ok: true }, counts: { teams, members, memos, calendars }, recentTeams };
  } catch (err) {
    return { db: { ok: false, error: (err as Error).message }, counts: { teams: 0, members: 0, memos: 0, calendars: 0 }, recentTeams: [] };
  }
}

router.get("/teams/overview", async (_req, res) => {
  res.json(await getTeamsOverview());
});

export default router;
