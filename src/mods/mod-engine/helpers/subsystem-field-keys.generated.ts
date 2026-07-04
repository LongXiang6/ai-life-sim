/**
 * @module auto-generated
 * @description 自动生成文件，由 scripts/codegen/generate-mod-wiring.mjs 维护 — 请勿手动编辑
 * @mod codegen
 * Regenerate: npm run generate:wiring
 */

/** SUBSYSTEM_FIELD_MAP 注册的子系统 id 列表 */
export const SUBSYSTEM_FIELD_REGISTRY_KEYS = [
  "character-base",
  "health",
  "lifespan",
  "morality",
  "luck",
  "faith",
  "family",
  "education",
  "work",
  "economy",
  "reputation",
  "relationship",
  "market",
  "population",
  "cultivation",
  "combat-power"
] as const

/** SUBSYSTEM_CHANGE_SCHEMAS 各子系统 Zod 字段（codegen 自动推导） */
export const SUBSYSTEM_ZOD_FIELD_KEYS: Record<string, readonly string[]> = {
  "character-base": [
    "physique",
    "mind",
    "comprehension",
    "charisma",
    "background"
  ],
  "health": [
    "hpDelta",
    "staminaDelta",
    "spiritDelta",
    "addDiseases",
    "addInjuries"
  ],
  "lifespan": [
    "age",
    "lifespanDelta",
    "maxAge"
  ],
  "morality": [
    "value",
    "delta"
  ],
  "luck": [
    "bonus",
    "delta"
  ],
  "faith": [
    "devotionLevel",
    "delta"
  ],
  "family": [
    "status",
    "members"
  ],
  "education": [
    "level",
    "progress",
    "graduated"
  ],
  "work": [
    "job",
    "income",
    "promotion"
  ],
  "economy": [
    "wealth",
    "priceIndex",
    "activityLevel",
    "socialClass"
  ],
  "reputation": [
    "fame",
    "delta",
    "addFame",
    "setFame",
    "addReputation",
    "dimension"
  ],
  "relationship": [
    "addRelation",
    "affinityDelta"
  ],
  "market": [
    "activityLevel",
    "trend"
  ],
  "population": [
    "total",
    "growthRate",
    "migrationDirection"
  ],
  "cultivation": [
    "realm",
    "cultivationProgress",
    "bottleneck"
  ],
  "combat-power": [
    "rank",
    "delta"
  ],
  "fate-prophecy": [
    "prophecy",
    "deadline",
    "triggerCondition"
  ]
} as const
