/**
 * @module world-customize.types.ts
 * @description 世界自定义页面类型定义 —— 宏观宇宙维度配置表
 * @mod mod-pages
 */

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
  /** 下拉项的补充展示信息；持久化仍使用 options 中的稳定值。 */
  optionDetails?: Record<string, {
    title: string
    description: string
  }>
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

/** 宏观维度字段配置表。力量字段只选择边界规则，具体阶位由世界框架固化。 */
export function buildFieldDefs(): Array<Omit<EditableField, 'playerValue' | 'mode' | 'customValue'>> {
  return [
    {
      key: 'universeScale',
      category: 'macro',
      label: '世界空间形态',
      options: ['位面', '宇宙', '位面晶壁群系', '多元宇宙群系', '诸天万界'],
      icon: '🗺️',
      description: '决定世界的空间形态',
    },
    {
      key: 'worldviewEssence',
      category: 'macro',
      label: '世界观本质',
      options: ['唯物主义', '唯心主义', '唯物修仙', '唯心修仙', '混合'],
      icon: '🌐',
      description: '决定世界的底层运行规则',
    },
    {
      key: 'powerSystem',
      category: 'macro',
      label: '力量体系',
      options: ['无', '修仙', '魔法', '灵能', '科技', '异能', '混合'],
      icon: '⚡',
      description: '决定世界的力量来源和修炼方式',
    },
    {
      key: 'powerFramework',
      category: 'macro',
      label: '力量框架',
      options: ['有限体系', '开放进阶'],
      optionDetails: {
        '有限体系': { title: '有限体系', description: '当前世界的最高阶位就是可达边界。' },
        '开放进阶': { title: '开放进阶', description: '当前阶位之后可由世界内事实继续定义。' },
      },
      icon: '🏔️',
      description: '决定世界力量阶位是否有固定边界',
    },
  ]
}
