/**
 * @module world-state-migration
 * @description 世界持久化与存档快照的兼容清洗
 * @mod mod-world
 */

import type { WorldConfig } from '../types'

const SCP_PRESET_NAME = 'SCP基金会'
const SCP_PRESET_DESCRIPTION_FINGERPRINT = ['SCP编号', '休谟指数', '现实扭曲者'] as const
const LEGACY_SCP_POWER_TAGS = new Set(['none', 'technology'])
const LEGACY_SCP_CONTRADICTORY_WORLD_TAGS = new Set([
  '无超自然',
  '无超自然力量',
  '禁止超自然',
  '严禁超自然',
  '超自然力量不存在',
  '无怪物',
  '纯科技世界',
  '纯现实世界',
  '科技决定论：所有现象必须可被科学解释',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 仅识别由旧版 SCP 预设映射产生的错误组合。
 * 名称与旧预设中的稳定描述片段共同作为版本指纹，允许玩家在原描述后追加内容，
 * 同时避免误改只有相同名称、但没有 SCP 设定特征的自定义世界。
 */
function isLegacyScpPresetConfig(value: unknown): value is Record<string, unknown> & WorldConfig {
  if (!isRecord(value)) return false
  const description = value.description
  if (typeof description !== 'string') return false
  return value.name === SCP_PRESET_NAME
    && SCP_PRESET_DESCRIPTION_FINGERPRINT.every((fragment) => description.includes(fragment))
    && value.essenceTag === 'modern'
    && typeof value.powerSystemTag === 'string'
    && LEGACY_SCP_POWER_TAGS.has(value.powerSystemTag)
}

function migrateLegacyScpCalibration(
  value: unknown,
  config: WorldConfig,
): unknown {
  if (value === null || value === undefined || !isRecord(value)) return value
  const metadata = isRecord(value.metadata) ? value.metadata : {}
  return {
    ...value,
    metadata: {
      ...metadata,
      essenceTag: 'mixed',
      civilizationStage: config.civilizationStage,
      powerSystemTag: 'mixed',
      spatialForm: config.spatialForm,
      difficulty: config.difficulty,
    },
  }
}

function migrateLegacyScpWorldTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((tag): tag is string => (
    typeof tag === 'string'
    && !LEGACY_SCP_CONTRADICTORY_WORLD_TAGS.has(tag.trim())
  ))
}

/**
 * 清洗 Zustand persist 或 OPFS 世界快照。
 *
 * 旧版把 SCP 基金会预设错误映射为纯现代科技世界，导致 UI 与叙事约束出现
 * “无超自然 / 严禁超自然”。迁移只修正该预设的结构化标签与校准元数据，
 * 年代、空间、难度、描述、实体、公式和有效 AI 氛围标签均保持原样。
 */
export function sanitizeWorldStateSnapshot(value: unknown): Record<string, unknown> {
  const record = isRecord(value) ? value : {}
  if (!isLegacyScpPresetConfig(record.worldConfig)) return { ...record }

  const dimensionValues = isRecord(record.worldConfig._dimensionValues)
    ? { ...record.worldConfig._dimensionValues }
    : record.worldConfig._dimensionValues
  if (isRecord(dimensionValues)) {
    delete dimensionValues.worldviewEssence
    delete dimensionValues.powerSystem
  }

  const worldConfig = {
    ...record.worldConfig,
    essenceTag: 'mixed',
    powerSystemTag: 'mixed',
    worldType: 'mixed',
    _dimensionValues: dimensionValues,
  } as WorldConfig

  return {
    ...record,
    worldConfig,
    calibration: migrateLegacyScpCalibration(record.calibration, worldConfig),
    // worldTags 是 AI 派生氛围信息；仅移除与 SCP 预设直接冲突的旧标签，
    // 其余异常收容、休谟指数等有效事实继续保留并进入 Prompt。
    worldTags: migrateLegacyScpWorldTags(record.worldTags),
  }
}
