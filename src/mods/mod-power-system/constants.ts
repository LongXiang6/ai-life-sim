/** World-neutral constants for the P8 extension layer. */

export const SUB_STAGE_LABELS: Record<number, string> = { 1: '初入', 2: '小成', 3: '大成', 4: '巅峰', 5: '圆满' }
export const SUB_STAGE_THRESHOLDS: Record<number, number> = { 1: 2000, 2: 4500, 3: 7000, 4: 9000, 5: 10000 }
export const BASE_POWER_GAIN = 200
export const INSIGHT_MULTIPLIER = 2
export const INSIGHT_DURATION = 30

export const MONSTER_TYPES_BY_WORLDVIEW: Record<string, readonly string[]> = {
  cultivation: ['妖兽', '妖魔', '阴魂'], eastern_fantasy: ['妖兽', '邪祟'], idealist: ['异兽', '灵体'],
  western_fantasy: ['巨龙', '巨魔', '亡灵'], mixed: ['异种', '巨兽'], survival_horror: ['变异体', '寄生体'],
  scifi: ['外星掠食者', '失控智能体'], post_apocalyptic: ['变异兽', '污染者'], materialist: ['猛兽', '掠食者'],
}
export const DEFAULT_MONSTER_TYPES = ['野兽', '猛兽'] as const
export const THREAT_ECOLOGY_PENALTY = 10
export const THREAT_POLLUTION_PENALTY = 20
export const THREAT_POPULATION_BONUS = -5
export const POPULATION_THREAT_MAGNITUDE = 5
export const ECOLOGY_LOW_THRESHOLD = 30
export const POLLUTION_HIGH_THRESHOLD = 60
export const POPULATION_HIGH_THRESHOLD = 500000
export const SPAWN_FREQUENCY_BASE = 0.05
export const SPAWN_FREQUENCY_MULTIPLIER = 0.01
export const NEW_TYPE_THREAT_THRESHOLD = 50
export const EVOLUTION_CHANCE_BASE = 0.15
export const MUTANT_MONSTER_CHANCE = 0.3
export const MONSTER_MODIFIER_MIN = 0.3
export const MONSTER_MODIFIER_MAX = 2
export const THREAT_MIN = 0
export const THREAT_MAX = 100
export const SPAWN_FREQ_MIN = 0
export const SPAWN_FREQ_MAX = 1

export const LUCK_DISEASE_AVOIDANCE_PER_POINT = 0.03
export const LUCK_DEATH_AVOID_CHANCE_PER_POINT = 0.02
export const LUCK_EVENT_WEIGHT_PER_POINT = 0.05

export const RARITY_LABELS: Record<string, string> = { common: '普通', uncommon: '稀有', rare: '罕见', fine: '精良', epic: '史诗', legendary: '传说' }
export const CATEGORY_LABELS: Record<string, string> = { cultivation: '修炼', magic: '奇幻', scifi: '科幻', wasteland: '废土' }
