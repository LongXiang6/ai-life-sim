/**
 * @module world-coherence-inference.ts
 * @description 据 worldDescription 检测与 AI 生成标签的潜在冲突
 *
 * 设计原则：
 *   AI 判定 > 用户输入 > 描述文本推断
 *   本模块只做"冲突检测"，不做"强制覆盖"。
 *   - 若 AI 已给合法值：保留，仅在预览/UI 上标记潜在冲突
 *   - 若 AI 未提供值（空字段）：才用描述推断作为兜底填充
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
}

export interface WorldCoherenceInference {
  /** 描述含史前/地猿关键词，可能与 AI 的高魔标签冲突 */
  prehistoric: boolean
  /** AI 生成的标签与史前描述存在潜在冲突，需用户确认 */
  potentialConflict: boolean
  reason?: string
  /** 建议值（仅作预览参考，不用于强制覆盖 AI 已提供的值） */
  suggestedEssenceTag?: string
  suggestedCivilizationStage?: string
  suggestedPowerSystemTag?: string
  suggestedSpatialForm?: string
}

export interface CoherenceFieldChange {
  field: keyof WorldConfig
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

/**
 * 检测描述是否包含史前关键词，并判断是否与 AI 标签冲突。
 * 返回的 suggested* 字段仅供预览展示，不直接用于覆盖。
 */
export function inferWorldCoherenceFromDescription(
  description: string,
  existingConfig?: Pick<WorldConfig, 'essenceTag' | 'powerSystemTag' | 'civilizationStage' | 'spatialForm'>,
): WorldCoherenceInference {
  const prehistoric = PREHISTORIC_DESC_RE.test(description)
  if (!prehistoric) {
    return { prehistoric: false, potentialConflict: false }
  }

  // 仅在 AI 未提供标签时，推断建议值作为兜底
  const hasExistingEssence = !!existingConfig?.essenceTag
  const hasExistingCiv = !!existingConfig?.civilizationStage
  const hasExistingPower = !!existingConfig?.powerSystemTag
  const hasExistingSpatial = !!existingConfig?.spatialForm

  const potentialConflict = existingConfig
    ? (HIGH_FANTASY_ESSENCE.has(existingConfig.essenceTag)
        || existingConfig.powerSystemTag === 'cultivation'
        || existingConfig.civilizationStage === 'medieval'
        || existingConfig.civilizationStage === 'space'
        || existingConfig.spatialForm === 'universe'
        || existingConfig.spatialForm === 'multiverse')
    : false

  return {
    prehistoric: true,
    potentialConflict,
    reason: potentialConflict
      ? '世界描述包含史前/地猿关键词，但 AI 判定为高魔/高武世界观；以 AI 为准，史前关键词可被理解为比喻或背景引用'
      : '世界描述指向史前/地猿时代',
    // 建议值仅在 AI 未提供时用于兜底填充
    suggestedEssenceTag: hasExistingEssence ? undefined : 'modern',
    suggestedCivilizationStage: hasExistingCiv ? undefined : 'primitive',
    suggestedPowerSystemTag: hasExistingPower ? undefined : 'none',
    suggestedSpatialForm: hasExistingSpatial ? undefined : 'plane',
  }
}

/**
 * 检查 AI 标签是否与史前描述存在潜在冲突（不自动修正，仅标记）。
 */
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
  const keys: Array<keyof WorldConfig> = [
    'essenceTag', 'powerSystemTag', 'civilizationStage', 'spatialForm',
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

/** 预览校正结果（不写入 store），新逻辑下仅在 AI 标签为空时补全 */
export function previewCoherenceCorrection(config: WorldConfig): CoherencePreview {
  const inference = inferWorldCoherenceFromDescription(config.description, config)
  const resolved = applyCoherenceToWorldConfig(config, { logWarnings: false })
  const changes = diffCoherenceFields(config, resolved)
  const hasConflict = inference.potentialConflict || changes.length > 0
  return { inference, hasConflict, resolved, changes }
}

/**
 * 供 AI Prompt 注入：描述当前标签与描述的匹配状态。
 * 仅在 AI 标签与史前描述有潜在冲突时给出提示，不做"已校正"断言。
 */
export function buildCoherenceNote(before: WorldConfig, after: WorldConfig): string {
  const inference = inferWorldCoherenceFromDescription(after.description, after)
  const changes = diffCoherenceFields(before, after)
  if (changes.length > 0) {
    const parts = changes.map((c) => `${c.label}: ${c.from}→${c.to}`)
    return `标签已补全：${parts.join('；')}；请以最终 worldDescription 为准`
  }
  if (inference.potentialConflict) {
    return '请以 worldDescription 为准：描述含史前关键词，但 AI 持有高魔标签，请确认是否构成冲突'
  }
  return '标签与描述一致；请以 worldDescription 为准分析系统适用性'
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
 * 将世界观描述推断合并进 WorldConfig
 *
 * 核心原则（AI 判断最高优先级）：
 *   1. AI 已提供的字段（非空）一律保留，不覆盖
 *   2. 仅当 AI 字段为空/未知时，用描述推断作兜底填充
 *   3. 冲突仅在 _aiFlags 中标记，由 UI 层提示用户确认
 */
export function applyCoherenceToWorldConfig(
  config: WorldConfig,
  options?: { logWarnings?: boolean },
): WorldConfig {
  const inference = inferWorldCoherenceFromDescription(config.description, config)
  if (!inference.prehistoric) return config

  const locks = config._coherenceLocks ?? {}

  // 若 AI 已有完整标签且与史前描述不冲突，直接返回
  const aiHasFullTags = config.essenceTag && config.civilizationStage
    && config.powerSystemTag && config.spatialForm
  const noConflict = !configConflictsWithPrehistoric(config)
  if (aiHasFullTags && noConflict) {
    return config
  }

  const next: WorldConfig = { ...config }

  // 仅填充 AI 未提供的字段
  if (!locks.essenceTag && !next.essenceTag && inference.suggestedEssenceTag) {
    next.essenceTag = inference.suggestedEssenceTag
  }
  if (!locks.civilizationStage && !next.civilizationStage && inference.suggestedCivilizationStage) {
    next.civilizationStage = inference.suggestedCivilizationStage
  }
  if (!locks.powerSystemTag && !next.powerSystemTag && inference.suggestedPowerSystemTag) {
    next.powerSystemTag = inference.suggestedPowerSystemTag
  }
  if (!locks.spatialForm && !next.spatialForm && inference.suggestedSpatialForm) {
    next.spatialForm = inference.suggestedSpatialForm
  }

  // 标记潜在冲突（供 UI 展示），不做强制覆盖
  if (inference.potentialConflict) {
    next._aiFlags = {
      ...next._aiFlags,
      coherenceConflict: true,
    }
  }

  if (inference.potentialConflict && options?.logWarnings !== false) {
    console.warn(
      `[mod-world] 描述含史前关键词但 AI 判定为高魔世界观，已保留 AI 标签；建议确认：essence=${config.essenceTag}, civ=${config.civilizationStage}`,
    )
  }

  return next
}
