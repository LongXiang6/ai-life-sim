/** World-neutral constants for the P8 extension layer. */

export const SUB_STAGE_LABELS: Record<number, string> = { 1: '初入', 2: '小成', 3: '大成', 4: '巅峰', 5: '圆满' }
export const SUB_STAGE_THRESHOLDS: Record<number, number> = { 1: 2000, 2: 4500, 3: 7000, 4: 9000, 5: 10000 }
export const BASE_POWER_GAIN = 200
export const INSIGHT_MULTIPLIER = 2
export const INSIGHT_DURATION = 30

export const RARITY_LABELS: Record<string, string> = { common: '普通', uncommon: '稀有', rare: '罕见', fine: '精良', epic: '史诗', legendary: '传说' }
export const CATEGORY_LABELS: Record<string, string> = { cultivation: '修炼', magic: '奇幻', scifi: '科幻', wasteland: '废土' }
