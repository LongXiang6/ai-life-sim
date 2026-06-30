/**
 * @module world-customize.types.ts
 * @description 世界自定义页面类型定义 —— 宏观宇宙维度配置表
 * @mod mod-pages
 */

import { UNIT_NAMES, RATING_DESCRIPTIONS, TRUE_INFINITE_DESCRIPTION } from '@/mods/mod-power-system'

/** 字段大类 */
export type FieldCategory = 'macro'

/** 维度模式 */
export type FieldMode = 'ai' | 'adaptive' | 'custom'

/** 模式标签 */
export const FIELD_MODE_LABELS: Record<FieldMode, string> = {
  ai: 'AI决定',
  adaptive: '选择',
  custom: '自定义',
}

/** 世界描述 / 维度自定义文本最大字数 */
export const WORLD_CUSTOM_TEXT_MAX_LENGTH = 5000

/** 单个可编辑维度 */
export interface EditableField {
  /** 关联 key */
  key: string
  /** 所属大类 */
  category: FieldCategory
  /** 显示标签 */
  label: string
  /** 下拉选项 */
  options: string[]
  /** 图标 emoji */
  icon: string
  /** 描述提示 */
  description: string
  /** 玩家编辑值 */
  playerValue: string
  /** 当前模式 */
  mode: FieldMode
  /** 自定义模式下的用户输入文本 */
  customValue: string
}

/** 大类标签 */
export const CATEGORY_LABELS: Record<FieldCategory, string> = {
  macro: '宇宙基础设定',
}

/** 生成力量上限选项（1-24阶，数字+单位名+详细描述） */
function buildPowerCeilingOptions(_maxLevel: number): string[] {
  const result: string[] = []
  for (let i = 1; i <= 24; i++) {
    const unit = UNIT_NAMES[i] ? `【${UNIT_NAMES[i]}级】` : ''
    const desc = i === 24 ? TRUE_INFINITE_DESCRIPTION : (RATING_DESCRIPTIONS[i] ?? '')
    result.push(`${i}阶${unit}：${desc}`)
  }
  return result
}

/** 宏观维度字段配置表（动态生成力量上限选项）
 * @param maxPowerCeiling 最大力量上限等级（默认 24）
 * @returns 字段定义数组
 */
export function buildFieldDefs(maxPowerCeiling = 24): Array<Omit<EditableField, 'playerValue' | 'mode' | 'customValue'>> {
  return [
    {
      key: 'powerSystem',
      category: 'macro',
      label: '力量体系',
      options: ['无', '修仙', '魔法', '灵能', '科技', '异能', '混合'],
      icon: '⚡',
      description: '决定世界的力量来源和修炼方式',
    },
    {
      key: 'worldviewEssence',
      category: 'macro',
      label: '世界观本质',
      options: ['唯物主义', '唯心主义', '唯物修仙', '唯心修仙', '混合'],
      icon: '🌌',
      description: '决定世界的底层运行规则',
    },
    {
      key: 'powerCeiling',
      category: 'macro',
      label: '力量上限',
      options: buildPowerCeilingOptions(maxPowerCeiling),
      icon: '✨',
      description: '决定世界力量体系的天花板',
    },
    {
      key: 'universeScale',
      category: 'macro',
      label: '世界空间形态',
      options: ['位面', '宇宙', '位面晶壁群系', '多元宇宙群系', '诸天万界'],
      icon: '🌍',
      description: '决定世界的空间形态',
    },
    {
      key: 'civilizationStage',
      category: 'macro',
      label: '文明阶段',
      options: ['原始', '古代', '中世纪', '近代', '现代', '未来'],
      icon: '🏛️',
      description: '决定文明的发展程度',
    },
  ]
}
