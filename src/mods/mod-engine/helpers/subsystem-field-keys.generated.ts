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
  "growth-system",
  "health",
  "lifespan",
  "morality",
  "faith",
  "education",
  "work",
  "economy",
  "reputation",
  "npc-system",
  "relationship-system",
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
  "growth-system": [
    "name",
    "category",
    "description",
    "scopeKind",
    "scopeContextIds",
    "potentialCap",
    "experienceDelta",
    "useCountDelta",
    "potential",
    "learningConstraints",
    "potentialDelta",
    "abilityStatus"
  ],
  "health": [
    "vitalityDelta",
    "staminaDelta",
    "spiritDelta",
    "conditionKind",
    "conditionName",
    "bodyPart",
    "severity",
    "recoveryDays",
    "attributeModifiers",
    "conditionTags",
    "resolution"
  ],
  "lifespan": [
    "maximumDaysDelta",
    "raceId",
    "raceDisplayName",
    "clockMode",
    "baseLifespanDays",
    "maximumLifespanDays",
    "attrBaselines"
  ],
  "morality": [
    "delta"
  ],
  "faith": [
    "devotionLevel",
    "delta"
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
    "scopeKind",
    "evaluatorEntityId",
    "scopeContextId",
    "dimension",
    "delta"
  ],
  "npc-system": [
    "displayName",
    "creationSource",
    "stableTraits",
    "localName",
    "stance",
    "role",
    "localRuleModifiers",
    "description",
    "targetEntityIds",
    "behaviorOperation",
    "spatialNodeId",
    "summary",
    "emotion",
    "relatedEntityIds",
    "sourceMemoryIds"
  ],
  "relationship-system": [
    "toEntityId",
    "categoryTags",
    "affinity",
    "trust",
    "bond",
    "conflict",
    "affinityDelta",
    "trustDelta",
    "bondDelta",
    "conflictDelta",
    "scopeKind",
    "scopeContextIds"
  ],
  "population": [
    "total",
    "growthRate",
    "migrationDirection"
  ],
  "cultivation": [
    "penaltyDelta",
    "talentTags",
    "realmIndex"
  ],
  "combat-power": [
    "progressDelta",
    "rankId",
    "label"
  ]
} as const
