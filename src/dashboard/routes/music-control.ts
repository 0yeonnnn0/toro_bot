import { Router, Request, Response } from "express";
import { client } from "../../bot/client";
import {
  getActiveMusicQueues,
  getQueue,
  getNowPlaying,
  getAutoplay,
  searchTracks,
  addTrackToQueue,
  moveTrack,
  removeTrack,
  setAutoplay,
  triggerAutoplayNow,
} from "../../bot/music";

const router = Router();

function getParam(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] : (value || "");
}

router.get("/music/queues", (_req: Request, res: Response) => {
  res.json(getActiveMusicQueues().map(queue => ({
    ...queue,
    guildName: client.guilds.cache.get(queue.guildId)?.name || queue.guildId,
  })));
});

router.get("/music/queues/:guildId", (req: Request, res: Response) => {
  const guildId = getParam(req.params.guildId);
  const tracks = getQueue(guildId);
  if (tracks.length === 0) return res.status(404).json({ error: "활성 음악 큐가 없습니다" });

  const nowPlaying = getNowPlaying(guildId);
  res.json({
    guildId,
    guildName: client.guilds.cache.get(guildId)?.name || guildId,
    nowPlaying,
    tracks,
    autoplay: getAutoplay(guildId),
  });
});

router.post("/music/queues/:guildId/tracks", async (req: Request, res: Response) => {
  const guildId = getParam(req.params.guildId);
  const query = String(req.body.query || "").trim();
  if (!query) return res.status(400).json({ error: "query가 필요합니다" });
  if (getQueue(guildId).length === 0) return res.status(404).json({ error: "활성 음악 큐가 없습니다" });

  const tracks = await searchTracks(query, "Web", 1);
  if (tracks.length === 0) return res.status(404).json({ error: "노래를 찾을 수 없습니다" });

  const position = addTrackToQueue(guildId, tracks[0]);
  if (position === null) return res.status(404).json({ error: "활성 음악 큐가 없습니다" });
  res.json({ ok: true, track: tracks[0], position, tracks: getQueue(guildId) });
});

router.patch("/music/queues/:guildId/tracks/move", (req: Request, res: Response) => {
  const guildId = getParam(req.params.guildId);
  const from = Number(req.body.from);
  const to = Number(req.body.to);
  if (!Number.isInteger(from) || !Number.isInteger(to)) {
    return res.status(400).json({ error: "from/to는 정수여야 합니다" });
  }

  const moved = moveTrack(guildId, from, to);
  if (!moved) return res.status(400).json({ error: "재생 중인 곡은 이동할 수 없거나 번호가 잘못되었습니다" });
  res.json({ ok: true, track: moved, tracks: getQueue(guildId) });
});

router.delete("/music/queues/:guildId/tracks/:index", (req: Request, res: Response) => {
  const guildId = getParam(req.params.guildId);
  const index = Number(getParam(req.params.index));
  if (!Number.isInteger(index)) return res.status(400).json({ error: "index는 정수여야 합니다" });

  const removed = removeTrack(guildId, index);
  if (!removed) return res.status(400).json({ error: "재생 중인 곡은 삭제할 수 없거나 번호가 잘못되었습니다" });
  res.json({ ok: true, track: removed, tracks: getQueue(guildId) });
});

router.put("/music/queues/:guildId/autoplay", (req: Request, res: Response) => {
  const guildId = getParam(req.params.guildId);
  const genreRaw = req.body.genre;
  const genre = genreRaw === "off" ? "off" : (genreRaw === "artist" ? null : (typeof genreRaw === "string" && genreRaw.trim() ? genreRaw.trim() : null));
  const enabled = setAutoplay(guildId, genre);
  if (!enabled && genre !== "off") return res.status(404).json({ error: "활성 음악 큐가 없습니다" });
  if (enabled) triggerAutoplayNow(guildId).catch(() => {});
  res.json({ ok: true, autoplay: getAutoplay(guildId), tracks: getQueue(guildId) });
});

export default router;
