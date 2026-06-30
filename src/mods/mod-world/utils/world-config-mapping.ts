/**
 * @module world-config-mapping.ts
 * @description 世界配置 UI 中文选项 → WorldConfig 标签映射（world-customize / world-build 共用）
 * @mod mod-world
 */

import type { WorldConfig } from '../types'

/** 力量体系中文 → powerSystemTag */
export const POWER_SYSTEM_ZH_MAP: Record<string, string> = {
  无: 'none',
  修仙: 'cultivation',
  魔法: 'magic',
  灵能: 'psi',
  科技: 'technology',
  异能: 'psi',
  混合: 'mixed',
}

/** 世界观本质中文 → essenceTag */
export const WORLDVIEW_ESSENCE_ZH_MAP: Record<string, string> = {
  唯物主义: 'modern',
  唯心主义: 'modern',
  唯物修仙: 'materialist_cultivation',
  唯心修仙: 'idealist_cultivation',
  混合: 'mixed',
}

/** 中文空间形态 → spatialForm */
export const SPATIAL_FORM_ZH_MAP: Record<string, string> = {
  位面: 'plane',
  宇宙: 'universe',
  位面晶壁群系: 'crystalSphere',
  多元宇宙群系: 'multiverse',
  诸天万界: 'omniverse',
}

/** 中文文明阶段 → civilizationStage */
export const CIVILIZATION_ZH_MAP: Record<string, string> = {
  原始: 'primitive',
  古代: 'ancient',
  中世纪: 'medieval',
  近代: 'industrial',
  现代: 'modern',
  未来: 'space',
}

/** UI 字段 key → _coherenceLocks 键 */
export const COHERENCE_LOCK_FIELD_MAP: Record<string, keyof NonNullable<WorldConfig['_coherenceLocks']>> = {
  powerSystem: 'powerSystemTag',
  worldviewEssence: 'essenceTag',
  universeScale: 'spatialForm',
  civilizationStage: 'civilizationStage',
  essenceTag: 'essenceTag',
  powerSystemTag: 'powerSystemTag',
  spatialForm: 'spatialForm',
}

export function mapPowerSystemZhToTag(zh: string): string {
  return POWER_SYSTEM_ZH_MAP[zh] ?? 'cultivation'
}

export function mapWorldviewEssenceZhToTag(zh: string): string {
  return WORLDVIEW_ESSENCE_ZH_MAP[zh] ?? 'modern'
}

export function buildCoherenceLocksFromUi(
  lockedFields: Record<string, boolean>,
): WorldConfig['_coherenceLocks'] {
  const locks: NonNullable<WorldConfig['_coherenceLocks']> = {}
  for (const [fieldKey, locked] of Object.entries(lockedFields)) {
    if (!locked) continue
    const lockKey = COHERENCE_LOCK_FIELD_MAP[fieldKey]
    if (lockKey) locks[lockKey] = true
  }
  return Object.keys(locks).length > 0 ? locks : undefined
}
