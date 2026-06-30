/**
 * @module preset-world-code.ts
 * @description 预设世界稳定 worldCode —— 与废弃项目 presets 对齐，供本地 AI 缓存隔离
 * @mod mod-world
 */

import type { PresetWorld } from '../constants/presets'

/** 预设 id → 稳定 worldCode（对齐废弃项目 src/lib/config/ai/presets.ts） */
const PRESET_WORLD_CODE_BY_ID: Record<string, number> = {
  'modern-earth': 1,
  'wu-dao-world': 2,
  'scp-foundation': 3,
  'warhammer-40k': 4,
  'cyberpunk-2077': 5,
  'harry-potter': 6,
  'ancient-greece': 7,
  'roman-empire': 8,
  'yongle-ming': 10,
  'ancient-egypt': 13,
  'crusades': 14,
  'warring-states': 16,
  'song-prosperity': 17,
  'late-ming-crisis': 18,
  'medieval-europe': 19,
  'maya-civilization': 21,
  'sixteen-kingdoms': 23,
  'caribbean-pirates': 26,
  'forbidden-palace': 27,
  'douhun-continent': 28,
  'lord-of-rings': 29,
  'marvel-universe': 30,
  'elden-ring': 39,
  'battle-through-heavens': 43,
  'backrooms': 47,
}

/** 解析预设世界的稳定 worldCode（config 显式指定时优先） */
export function resolvePresetWorldCode(preset: PresetWorld): number {
  const fromConfig = preset.config.worldCode
  if (typeof fromConfig === 'number' && fromConfig > 0) {
    return fromConfig
  }
  return PRESET_WORLD_CODE_BY_ID[preset.id] ?? 0
}
