/**
 * @module talent-ui-config.ts
 * @description 天赋系统 UI 配置常量（从已废弃的 talent-system.ts 分离）
 * @mod mod-character
 *
 * 这些配置常量供角色创建页面、命格预览页面等 UI 组件使用，
 * 包括天赋稀有度、极性和选择数量的显示配置。
 */

/** 天赋稀有度 UI 配置 */
export const TALENT_RARITY_CONFIG: Record<string, { label: string; color: string; glow: string }> = {
  common: { label: '普通', color: '#94a3b8', glow: '0 0 6px #94a3b8' },
  fine: { label: '精良', color: '#22c55e', glow: '0 0 8px #22c55e' },
  rare: { label: '稀有', color: '#3b82f6', glow: '0 0 12px #3b82f6' },
  epic: { label: '史诗', color: '#a855f7', glow: '0 0 16px #a855f7' },
  legendary: { label: '传说', color: '#f59e0b', glow: '0 0 20px #f59e0b' },
}

/** 天赋极性 UI 配置 */
export const TALENT_POLARITY_CONFIG: Record<string, { label: string; color: string }> = {
  positive: { label: '正面', color: '#22c55e' },
  neutral: { label: '中立', color: '#94a3b8' },
  negative: { label: '负面', color: '#ef4444' },
}

/** 天赋选择数量常量（角色创建页使用） */
export const TALENT_SELECT_COUNT = 2
