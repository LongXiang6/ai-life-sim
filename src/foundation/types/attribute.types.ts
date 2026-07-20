/**
 * @module attribute.types.ts
 * @description 角色属性类型契约 —— 仅声明类型、常量、映射表，不含计算逻辑
 * @mod foundation
 *
 * 本文件是属性系统的**类型契约层**：
 * - 定义 AttributeId / AttributeData / AttributeTier 等类型形状
 * - 提供 ATTRIBUTE_IDS / ATTRIBUTE_NAMES / ATTRIBUTE_TIERS 等常量数据
 * - 不包含任何数值计算、Prompt 格式化、档位判断等运行逻辑
 *
 * 计算逻辑归属：
 *   getAttributeTier / formatAttributesForPrompt → mod-character 的 AttributeSystem 子系统
 *   基础属性写入与修正聚合 → mod-character 的 owning subsystem 与 Store
 */

// ──── 属性键 ────

/** 属性标识键 */
export type AttributeId = 'physique' | 'mind' | 'comprehension' | 'charisma' | 'fortune'

/** 玩家可见基础属性键（旧常量名保留兼容，不代表玩家可手动加点） */
export const ASSIGNABLE_ATTRIBUTE_IDS: readonly AttributeId[] = [
  'physique', 'mind', 'comprehension', 'charisma',
] as const

/** 隐藏属性键（1项，开局随机，玩家不可见） */
export const HIDDEN_ATTRIBUTE_IDS: readonly AttributeId[] = [
  'fortune',
] as const

/** 全部属性键常量数组 */
export const ATTRIBUTE_IDS: readonly AttributeId[] = [
  ...ASSIGNABLE_ATTRIBUTE_IDS,
  ...HIDDEN_ATTRIBUTE_IDS,
] as const

// ──── 属性元数据 ────

/** 属性中文名称映射 */
export const ATTRIBUTE_NAMES: Readonly<Record<AttributeId, string>> = {
  physique: '体魄',
  mind: '心智',
  comprehension: '悟性',
  charisma: '魅力',
  fortune: '气运',
}

/**
 * 属性语义描述（供子系统拼接 Prompt 时使用）
 *
 * 子系统在构造 AI 可读的属性摘要时，附带此描述，
 * 确保 AI 叙事时理解每个属性的实际含义而非猜测。
 */
export const ATTRIBUTE_DESCRIPTIONS: Readonly<Record<AttributeId, string>> = {
  physique: '身体素质、力量与体能',
  mind: '智力水平、意志力与心理韧性',
  comprehension: '学习能力、领悟速度与理解深度',
  charisma: '外貌、社交感染力与领导气质',
  fortune: '运气、机遇、命运青睐程度',
}

// ──── 属性值域 ────

/** 气运取值范围（开局随机，边界含 -4 和 +4） */
export const HIDDEN_FORTUNE_RANGE = { min: -4, max: 4 } as const

/**
 * 属性档位标签（11 档，以 0 = "普通" 为基准，正负对称分布）
 *
 * index=5 对应数值 0 = "普通"（游戏世界观中的基准水平）。
 * 正值 = 高于普通，负值 = 低于普通。
 */
export const ATTRIBUTE_TIERS = [
  '极差', '很差', '较差', '略逊', '稍逊',
  '普通',
  '稍优', '良好', '优秀', '卓越', '超凡',
] as const
export type AttributeTier = typeof ATTRIBUTE_TIERS[number]

// ──── 属性数据结构 ────

/** 属性数据 payload */
export interface AttributeData {
  physique: number,
  mind: number,
  comprehension: number,
  charisma: number,
  fortune: number,
}
