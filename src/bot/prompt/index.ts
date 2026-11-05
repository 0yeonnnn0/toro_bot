import DEFAULT_PRESETS from "./default-presets";

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

const FIXED_PRESET_ID = "neko";
const FIXED_PRESET = DEFAULT_PRESETS[FIXED_PRESET_ID];

export function getPresets(_enabledOnly = false): PresetInfo[] {
  return [{
    id: FIXED_PRESET_ID,
    name: FIXED_PRESET.name,
    description: FIXED_PRESET.description,
    active: true,
    enabled: true,
  }];
}

export function reorderPresets(_orderedIds: string[]): boolean {
  return true;
}

export function getPreset(id: string): Preset | null {
  return id === FIXED_PRESET_ID ? FIXED_PRESET : null;
}

export function getActivePresetId(): string {
  return FIXED_PRESET_ID;
}

export function setActivePreset(id: string): boolean {
  return id === FIXED_PRESET_ID;
}

export function upsertPreset(_id: string, _data: Partial<Preset>): void {
  // TORO는 단일 고정 페르소나만 사용한다.
}

export function togglePreset(id: string, enabled: boolean): boolean {
  return id === FIXED_PRESET_ID && enabled;
}

export function deletePreset(_id: string): boolean {
  return false;
}

export function getActivePrompt(): string {
  return FIXED_PRESET.prompt;
}

export function buildPromptWithCustom(_userId: string): string {
  return FIXED_PRESET.prompt;
}

console.log(`프리셋: ${FIXED_PRESET_ID} (${FIXED_PRESET.name})`);
