/**
 * @module auto-generated
 * @description 自动生成文件，由 scripts/codegen/generate-mod-wiring.mjs 维护 — 请勿手动编辑
 * @mod codegen
 * Regenerate: npm run generate:wiring
 */

/** SUBSYSTEM_FIELD_CONTRACTS 注册的子系统 id 列表 */
export const SUBSYSTEM_FIELD_REGISTRY_KEYS = [
  "world-context-registry",
  "contextual-capability-profile",
  "spatial-graph",
  "context-transition",
  "simulation-scope-policy",
  "world-init",
  "world-entity",
  "historical-event-ledger",
  "time",
  "orchestrator",
  "narrative-parser",
  "summary-compressor",
  "memory-engine",
  "subsystem-relevance",
  "memory-lifecycle",
  "memory-forgetting",
  "causal-delay",
  "plot-structure",
  "foreshadowing",
  "core-memory",
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

/** SUBSYSTEM_FIELD_CONTRACTS 各子系统字段（codegen 自动推导） */
export const SUBSYSTEM_ZOD_FIELD_KEYS: Record<string, readonly string[]> = {
  "world-context-registry": [],
  "contextual-capability-profile": [],
  "spatial-graph": [],
  "context-transition": [],
  "simulation-scope-policy": [],
  "world-init": [],
  "world-entity": [],
  "historical-event-ledger": [],
  "time": [],
  "orchestrator": [],
  "narrative-parser": [],
  "summary-compressor": [],
  "memory-engine": [],
  "subsystem-relevance": [],
  "memory-lifecycle": [],
  "memory-forgetting": [],
  "causal-delay": [],
  "plot-structure": [],
  "foreshadowing": [],
  "core-memory": [],
  "character-base": [
    "physiqueDelta",
    "mindDelta",
    "talentAptitudeDelta",
    "charismaDelta"
  ],
  "health": [
    "hpDelta",
    "staminaDelta",
    "spiritDelta",
    "addDiseases",
    "addInjuries"
  ],
  "lifespan": [
    "maxAge",
    "lifespanDelta"
  ],
  "morality": [
    "delta"
  ],
  "luck": [
    "luck"
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
  ]
} as const
