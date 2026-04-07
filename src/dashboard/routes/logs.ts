import { Router, Request, Response } from "express";
import { state, getTopKeywords, getUserStatsRanked } from "../../shared/state";
import { readLogs, listLogDates } from "../../shared/log-store";
import { getChatLogs, getChatLogStats } from "../chat-logs";
import { getMusicLogs, getMusicStats } from "../music-logs";

const router = Router();

router.get("/logs", (req: Request, res: Response) => {
  const date = (req.query.date as string) || new Date().toISOString().slice(0, 10);
  let logs = readLogs(date);
  const channel = req.query.channel as string | undefined;
  if (channel) logs = logs.filter((l) => l.channel === channel);
  res.json(logs);
});

router.get("/log-dates", (_req: Request, res: Response) => {
  res.json(listLogDates());
});

router.get("/user-stats", (_req: Request, res: Response) => res.json(getUserStatsRanked()));
router.get("/keywords", (req: Request, res: Response) => res.json(getTopKeywords(parseInt(req.query.limit as string || "20"))));

// Chat logs (admin only)
router.get("/chat-logs", (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string || "100");
  const sessionId = req.query.sessionId as string | undefined;
  res.json(getChatLogs(limit, sessionId));
});

router.get("/chat-logs/stats", (_req: Request, res: Response) => {
  res.json(getChatLogStats());
});

// Music logs (public)
router.get("/music-logs", (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string || "100");
  res.json(getMusicLogs(limit));
});

router.get("/music-logs/stats", (_req: Request, res: Response) => {
  res.json(getMusicStats());
});

export default router;
