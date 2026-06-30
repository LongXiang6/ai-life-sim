/**
 * @module world-coherence-inference.ts
 * @description 据 worldDescription 推断并校正 WorldConfig 标签（worldDescription > essenceTag）
 * @mod mod-world
 */

import type { WorldConfig } from '../types'

const PREHISTORIC_DESC_RE = /地猿|史前|古猿|猿人|新近纪|上新世|中新世|旧石器|早期人类|化石|直立行走|Australopithecus|元谋|北京人|能人|直立人/i

const HIGH_FANTASY_ESSENCE = new Set([
  'cultivation',
  'idealist_cultivation',
  'materialist_cultivation',
  'wuxia',
  'western-fantasy',
  'dark-fantasy',
])

const COHERENCE_FIELD_LABELS: Record<string, string> = {
  essenceTag: '世界观本质',
  powerSystemTag: '力量体系',
  civilizationStage: '文明阶段',
  spatialForm: '空间形态',
  powerCeiling: '力量上限',
}

export interface WorldCoherenceInference {
  prehistoric: boolean
  essenceTag?: string
  civilizationStage?: string
  powerSystemTag?: string
  spatialForm?: string
  /** 推断结果与当前 config 存在冲突 */
  conflictWithPreset: boolean
  reason?: string
}

export interface CoherenceFieldChange {
  field: keyof WorldConfig | 'powerCeiling'
  label: string
  from: string | number
  to: string | number
}

export interface CoherencePreview {
  inference: WorldCoherenceInference
  hasConflict: boolean
  resolved: WorldConfig
  changes: CoherenceFieldChange[]
}

export function inferWorldCoherenceFromDescription(description: string): WorldCoherenceInference {
  const prehistoric = PREHISTORIC_DESC_RE.test(description)
  if (!prehistoric) {
    return { prehistoric: false, conflictWithPreset: false }
  }

  return {
    prehistoric: true,
    essenceTag: 'modern',
    civilizationStage: 'primitive',
    powerSystemTag: 'none',
    spatialForm: 'plane',
    conflictWithPreset: true,
    reason: '世界描述指向史前/地猿时代，系统将优先于 essenceTag 校正标签',
  }
}

export function configConflictsWithPrehistoric(config: WorldConfig): boolean {
  return (
    HIGH_FANTASY_ESSENCE.has(config.essenceTag)
    || config.powerSystemTag === 'cultivation'
    || config.civilizationStage === 'medieval'
    || config.civilizationStage === 'space'
    || config.spatialForm === 'universe'
    || config.spatialForm === 'multiverse'
  )
}

function diffCoherenceFields(before: WorldConfig, after: WorldConfig): CoherenceFieldChange[] {
  const keys: Array<keyof WorldConfig | 'powerCeiling'> = [
    'essenceTag', 'powerSystemTag', 'civilizationStage', 'spatialForm', 'powerCeiling',
  ]
  const changes: CoherenceFieldChange[] = []
  for (const key of keys) {
    const from = before[key as keyof WorldConfig]
    const to = after[key as keyof WorldConfig]
    if (from !== to) {
      changes.push({
        field: key,
        label: COHERENCE_FIELD_LABELS[key] ?? key,
        from: from as string | number,
        to: to as string | number,
      })
    }
  }
  return changes
}

/** 预览校正结果（不写入 store） */
export function previewCoherenceCorrection(config: WorldConfig): CoherencePreview {
  const inference = inferWorldCoherenceFromDescription(config.description)
  const resolved = applyCoherenceToWorldConfig(config, { logWarnings: false })
  const changes = diffCoherenceFields(config, resolved)
  const hasConflict = inference.prehistoric && configConflictsWithPrehistoric(config) && changes.length > 0
  return { inference, hasConflict, resolved, changes }
}

/** 供 AI Prompt 注入：描述系统是否已校正标签 */
export function buildCoherenceNote(before: WorldConfig, after: WorldConfig): string {
  const changes = diffCoherenceFields(before, after)
  if (changes.length === 0) return '无系统校正；请以 worldDescription 为准分析系统适用性'
  const inference = inferWorldCoherenceFromDescription(after.description)
  const parts = changes.map((c) => `${c.label}: ${c.from}→${c.to}`)
  if (inference.reason) parts.unshift(inference.reason)
  return parts.join('；')
}

/**
 * 用户选择「保持我的标签」：锁定全部可校正字段后跳过自动覆盖
 */
export function applyCoherenceKeepUserTags(config: WorldConfig): WorldConfig {
  return {
    ...config,
    _coherenceLocks: {
      essenceTag: true,
      civilizationStage: true,
      powerSystemTag: true,
      spatialForm: true,
      ...config._coherenceLocks,
    },
  }
}

/**
 * 将世界观一致性推断合并进 WorldConfig（尊重 _coherenceLocks 显式锁定）
 */
export function applyCoherenceToWorldConfig(
  config: WorldConfig,
  options?: { logWarnings?: boolean },
): WorldConfig {
  const inference = inferWorldCoherenceFromDescription(config.description)
  if (!inference.prehistoric) return config

  const locks = config._coherenceLocks ?? {}
  const conflict = configConflictsWithPrehistoric(config)
  if (!conflict && config.civilizationStage === 'primitive' && config.powerSystemTag === 'none') {
    return config
  }

  const next: WorldConfig = { ...config }

  if (!locks.essenceTag && inference.essenceTag) next.essenceTag = inference.essenceTag
  if (!locks.civilizationStage && inference.civilizationStage) {
    next.civilizationStage = inference.civilizationStage
  }
  if (!locks.powerSystemTag && inference.powerSystemTag) next.powerSystemTag = inference.powerSystemTag
  if (!locks.spatialForm && inference.spatialForm) next.spatialForm = inference.spatialForm

  if (!locks.spatialForm && next.powerCeiling > 8 && next.spatialForm === 'plane') {
    next.powerCeiling = 8
  }

  next._aiFlags = { ...next._aiFlags, coherenceApplied: true }

  if (conflict && options?.logWarnings !== false) {
    console.warn(
      `[mod-world] 世界观标签与描述冲突，已校正: essence=${config.essenceTag}→${next.essenceTag}, ` +
      `civ=${config.civilizationStage}→${next.civilizationStage}`,
    )
  }

  return next
}
