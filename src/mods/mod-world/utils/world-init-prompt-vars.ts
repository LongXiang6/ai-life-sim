/**
 * @module world-init-prompt-vars.ts
 * @description world-init AI Prompt 变量构建（含 coherenceNote / worldType / 维度选择 / 力量上限预设）
 * @mod mod-world
 */

import type { WorldCalibration, WorldConfig, RegionData } from '../types'
import { formatCalibrationSummary } from './calibration-clamp'
import { buildWorldCoherenceHint } from './world-coherence-hints'
import { buildCoherenceNote } from './world-coherence-inference'
import { formatPowerFrameworkForPrompt } from './power-framework'

// ==================== 维度选择格式化 ====================

/**
 * 只投影当前世界已固化的力量框架，不发送跨世界固定阶位表。
 */
/** 维度字段中文名映射 */
const DIMENSION_KEY_LABELS: Record<string, string> = {
  powerSystem: '力量体系',
  powerFramework: '力量框架',
  worldviewEssence: '世界观本质',
  universeScale: '世界空间形态',
  civilizationStage: '文明阶段',
}

/** 维度字段选项映射（预设选项） */
const DIMENSION_KEY_OPTIONS: Record<string, string[]> = {
  powerSystem: ['无', '修仙', '魔法', '灵能', '科技', '异能', '混合'],
  powerFramework: ['有限体系', '开放进阶'],
  worldviewEssence: ['唯物主义', '唯心主义', '唯物修仙', '唯心修仙', '混合'],
  universeScale: ['位面', '宇宙', '位面晶壁群系', '多元宇宙群系', '诸天万界'],
  civilizationStage: ['原始', '古代', '中世纪', '近代', '现代', '未来'],
}

/** 构建维度选择摘要文本（传给 AI prompt） */
export function buildDimensionChoicesText(config: WorldConfig): string {
  const modes = config._dimensionModes ?? {}
  const values = config._dimensionValues ?? {}
  const lines: string[] = []

  const currentValues: Record<string, string> = {
    powerSystem: config.powerSystemTag,
    powerFramework: config.powerFramework.enabled
      ? config.powerFramework.progression === 'open' ? '开放进阶' : '有限体系'
      : '无',
    worldviewEssence: config.essenceTag,
    universeScale: config.spatialForm,
    civilizationStage: config.civilizationStage,
  }

  for (const key of Object.keys(DIMENSION_KEY_LABELS)) {
    const label = DIMENSION_KEY_LABELS[key]
    const mode = modes[key] ?? 'ai'
    const modeLabel = mode === 'ai' ? 'AI决定' : mode === 'adaptive' ? '用户选择' : '用户自定义'
    const userVal = values[key] ?? ''
    const currentVal = currentValues[key] ?? ''

    let line = `${label}：模式=${modeLabel}`
    if (mode === 'adaptive' && userVal) {
      line += `，用户选了「${userVal}」（当前映射=${currentVal}）`
    } else if (mode === 'custom' && userVal) {
      line += `，用户自定义：「${userVal}」`
    } else if (mode === 'ai') {
      line += `（当前值=${currentVal}，可自由调整）`
    }
    lines.push(line)
  }

  return lines.join('\n')
}

/** 构建各维度可选选项参考文本 */
export function buildDimensionOptionsText(): string {
  const lines: string[] = []
  for (const key of Object.keys(DIMENSION_KEY_LABELS)) {
    const label = DIMENSION_KEY_LABELS[key]
    const opts = DIMENSION_KEY_OPTIONS[key]
    if (opts.length > 0) {
      lines.push(`${label} 可选值：${opts.join('、')}`)
    }
  }
  return lines.join('\n')
}

const ENTITY_RANGE_LABELS: Record<string, string> = {
  nationCount: '国家',
  factionCount: '势力',
  nobleHouseCount: '贵族',
  settlementCount: '定居点',
  tradeRouteCount: '商路',
}

/** 氛围标签 → Prompt 单行文本 */
export function formatWorldTagsForPrompt(tags: string[] | undefined): string {
  if (!tags?.length) return '（尚未生成，请仅依据 worldDescription 推断）'
  return tags.join('、')
}

/** 实体数量范围 → Prompt 摘要 */
export function formatEntityRangesForPrompt(cal: WorldCalibration | null | undefined): string {
  const entities = cal?.entities
  if (!entities) return '各层按世界观默认'

  const parts: string[] = []
  for (const [key, label] of Object.entries(ENTITY_RANGE_LABELS)) {
    const range = entities[key as keyof typeof entities]
    if (range && (range.min > 0 || range.max > 0)) {
      parts.push(`${label} ${range.min}-${range.max}`)
    } else if (range && range.min === 0 && range.max === 0) {
      parts.push(`${label} 禁用`)
    }
  }
  return parts.length > 0 ? parts.join('；') : '各层按世界观默认'
}

/** 地图区域摘要 → Prompt（供区域概况 AI 逐项补充） */
export function formatRegionsForPrompt(regions: RegionData[]): string {
  if (!regions.length) {
    return '（无区域数据）'
  }
  return regions.map((r) => [
    `- regionId="${r.id}"`,
    `名称=${r.name}`,
    `地形=${r.terrainTag}`,
    `模板=${r.templateType}`,
    `现有概况=${r.summary}`,
  ].join(' ')).join('\n')
}

/** 构建 world-init 各步 Prompt 共用变量 */
export function buildWorldInitPromptVars(
  config: WorldConfig,
  options?: {
    /** 校正前的 config，用于生成 coherenceNote */
    beforeConfig?: WorldConfig
    extra?: Record<string, string>
    worldTags?: string[]
    calibration?: WorldCalibration | null
  },
): Record<string, string> {
  const description = config.description
  const before = options?.beforeConfig ?? config
  const cal = options?.calibration

  return {
    worldName: config.name,
    essenceTag: config.essenceTag,
    powerSystemTag: config.powerSystemTag,
    civilizationStage: config.civilizationStage,
    spatialForm: config.spatialForm,
    worldDescription: description,
    powerFramework: formatPowerFrameworkForPrompt(config.powerFramework) ?? '（无超常力量框架）',
    difficulty: config.difficulty,
    worldType: config.worldType ?? 'idealist',
    existingEntities: options?.extra?.existingEntities ?? '',
    worldTags: options?.extra?.worldTags ?? formatWorldTagsForPrompt(options?.worldTags),
    calibrationSummary: options?.extra?.calibrationSummary
      ?? (cal ? formatCalibrationSummary(cal) : '（校准尚未完成）'),
    entityRanges: options?.extra?.entityRanges ?? formatEntityRangesForPrompt(cal),
    coherenceHint: buildWorldCoherenceHint(config.civilizationStage, description),
    coherenceNote: buildCoherenceNote(before, config),
    dimensionChoices: buildDimensionChoicesText(config),
    dimensionOptions: buildDimensionOptionsText(),
    ...options?.extra,
  }
}
