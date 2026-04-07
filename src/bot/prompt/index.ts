import fs from "fs";
import path from "path";
import DEFAULT_PRESETS from "./default-presets";

const DATA_DIR = path.join(__dirname, "../../../data");
const PRESETS_FILE = path.join(DATA_DIR, "presets.json");
const ACTIVE_FILE = path.join(DATA_DIR, "active-preset.json");
const ORDER_FILE = path.join(DATA_DIR, "preset-order.json");

// ── Types ──
export interface Preset {
  name: string;
  description: string;
  prompt: string;
  ownerSuffix: string;
  userSuffix: string;
  enabled: boolean;
  voice: string;
}

export interface PresetInfo {
  id: string;
  name: string;
  description: string;
  active: boolean;
  enabled: boolean;
}

// ── 프리셋 저장/불러오기 ──
let presets: Record<string, Preset> = { ...DEFAULT_PRESETS };
let activePresetId = "neko";

try {
  if (fs.existsSync(PRESETS_FILE)) {
    const saved = JSON.parse(fs.readFileSync(PRESETS_FILE, "utf-8"));
    const merged: Record<string, Preset> = { ...DEFAULT_PRESETS, ...saved };
    // Restore saved order
    if (fs.existsSync(ORDER_FILE)) {
      const order: string[] = JSON.parse(fs.readFileSync(ORDER_FILE, "utf-8"));
      const ordered: Record<string, Preset> = {};
      for (const id of order) {
        if (merged[id]) ordered[id] = merged[id];
      }
      // Append any new presets not in saved order
      for (const [id, p] of Object.entries(merged)) {
        if (!ordered[id]) ordered[id] = p;
      }
      presets = ordered;
    } else {
      presets = merged;
    }
    console.log("저장된 프리셋 복원 완료");
  }
  if (fs.existsSync(ACTIVE_FILE)) {
    const data = JSON.parse(fs.readFileSync(ACTIVE_FILE, "utf-8"));
    let id = data.activePresetId || "neko";
    // Migrate old preset ID
    if (id === "mimic") id = "yeonnnn";
    activePresetId = id;
  }
} catch (err) {
  console.error("프리셋 복원 실패:", (err as Error).message);
}

function ensureDir(): void {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function savePresets(): void {
  try {
    ensureDir();
    const custom: Record<string, Preset> = {};
    for (const [id, preset] of Object.entries(presets)) {
      if (!DEFAULT_PRESETS[id] || JSON.stringify(preset) !== JSON.stringify(DEFAULT_PRESETS[id])) {
        custom[id] = preset;
      }
    }
    fs.writeFileSync(PRESETS_FILE, JSON.stringify(custom, null, 2));
    fs.writeFileSync(ACTIVE_FILE, JSON.stringify({ activePresetId }));
    fs.writeFileSync(ORDER_FILE, JSON.stringify(Object.keys(presets)));
  } catch (err) {
    console.error("프리셋 저장 실패:", (err as Error).message);
  }
}

// ── API ──
export function getPresets(enabledOnly = false): PresetInfo[] {
  return Object.entries(presets)
    .filter(([, p]) => !enabledOnly || p.enabled !== false)
    .map(([id, p]) => ({
      id,
      name: p.name,
      description: p.description,
      active: id === activePresetId,
      enabled: p.enabled !== false,
    }));
}

export function reorderPresets(orderedIds: string[]): boolean {
  const reordered: Record<string, Preset> = {};
  for (const id of orderedIds) {
    if (presets[id]) reordered[id] = presets[id];
  }
  // Append any remaining presets not in the list
  for (const [id, p] of Object.entries(presets)) {
    if (!reordered[id]) reordered[id] = p;
  }
  // Replace presets object while keeping reference
  for (const key of Object.keys(presets)) delete presets[key];
  Object.assign(presets, reordered);
  savePresets();
  return true;
}

export function getPreset(id: string): Preset | null {
  return presets[id] || null;
}

export function getActivePresetId(): string {
  return activePresetId;
}

export function setActivePreset(id: string): boolean {
  if (!presets[id]) return false;
  activePresetId = id;
  savePresets();
  return true;
}

export function upsertPreset(id: string, data: Partial<Preset>): void {
  const existing = presets[id];
  presets[id] = {
    name: data.name || id,
    description: data.description || "",
    prompt: data.prompt || "",
    ownerSuffix: data.ownerSuffix || "",
    userSuffix: data.userSuffix || "",
    enabled: data.enabled !== undefined ? data.enabled : (existing?.enabled !== false),
    voice: data.voice || existing?.voice || "kore",
  };
  savePresets();
}

export function togglePreset(id: string, enabled: boolean): boolean {
  if (!presets[id]) return false;
  presets[id].enabled = enabled;
  // If disabling the active preset, fall back to neko
  if (!enabled && activePresetId === id) {
    activePresetId = "neko";
  }
  savePresets();
  return true;
}

export function deletePreset(id: string): boolean {
  if (!presets[id]) return false;
  delete presets[id];
  if (activePresetId === id) activePresetId = "neko";
  savePresets();
  return true;
}

// ── 프롬프트 빌드 ──
export function getActivePrompt(): string {
  return presets[activePresetId]?.prompt || presets.neko.prompt;
}

export function buildPromptWithCustom(userId: string): string {
  const preset = presets[activePresetId] || presets.neko;
  const ownerIds = (process.env.OWNER_ID || "").split(",").map((id) => id.trim());
  const isOwner = ownerIds.includes(userId);

  let result = preset.prompt;
  if (isOwner && preset.ownerSuffix) {
    result += preset.ownerSuffix;
  } else if (!isOwner && preset.userSuffix) {
    result += preset.userSuffix;
  }
  return result;
}

console.log(`프리셋: ${activePresetId} (${presets[activePresetId]?.name})`);
