import { Router, Request, Response } from "express";
import {
  getPresets, getPreset, getActivePresetId, setActivePreset,
  upsertPreset, deletePreset, togglePreset, reorderPresets, getActivePrompt,
} from "../../bot/prompt";

const router = Router();

router.get("/presets", (_req: Request, res: Response) => {
  res.json({ presets: getPresets(), activeId: getActivePresetId() });
});

router.put("/presets/reorder", (req: Request, res: Response) => {
  const { ids } = req.body;
  if (!Array.isArray(ids)) return res.status(400).json({ error: "ids 배열 필요" });
  reorderPresets(ids);
  res.json({ ok: true });
});

router.get("/presets/:id", (req: Request, res: Response) => {
  const preset = getPreset(req.params.id as string);
  if (!preset) return res.status(404).json({ error: "프리셋 없음" });
  res.json({ id: req.params.id as string, ...preset });
});

router.put("/presets/:id/activate", (req: Request, res: Response) => {
  if (!setActivePreset(req.params.id as string)) return res.status(404).json({ error: "프리셋 없음" });
  res.json({ activeId: req.params.id as string });
});

router.put("/presets/:id/toggle", (req: Request, res: Response) => {
  const { enabled } = req.body;
  if (typeof enabled !== "boolean") return res.status(400).json({ error: "enabled (boolean) 필요" });
  if (!togglePreset(req.params.id as string, enabled)) return res.status(404).json({ error: "프리셋 없음" });
  res.json({ id: req.params.id, enabled });
});

router.put("/presets/:id", (req: Request, res: Response) => {
  upsertPreset(req.params.id as string, req.body);
  res.json({ id: req.params.id as string, ...getPreset(req.params.id as string) });
});

router.post("/presets", (req: Request, res: Response) => {
  const id = req.body.id || `custom_${Date.now()}`;
  upsertPreset(id, req.body);
  res.json({ id, ...getPreset(id) });
});

router.delete("/presets/:id", (req: Request, res: Response) => {
  if (!deletePreset(req.params.id as string)) return res.status(400).json({ error: "프리셋을 찾을 수 없습니다" });
  res.json({ ok: true });
});

router.get("/prompt", (_req: Request, res: Response) => {
  const preset = getPreset(getActivePresetId());
  res.json({ prompt: preset?.prompt || "", presetId: getActivePresetId() });
});

export default router;
