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
  "historical-event-ledger",
  "growth-system",
  "character-base",
  "destiny-pattern",
  "culture-tech",
  "time",
  "orchestrator",
  "narrative-parser",
  "summary-compressor",
  "subsystem-relevance",
  "memory-lifecycle",
  "causal-delay",
  "plot-structure",
  "foreshadowing",
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
  "historical-event-ledger": [],
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
  "character-base": [
    "physiqueDelta",
    "mindDelta",
    "talentAptitudeDelta",
    "charismaDelta",
    "vitalityDelta",
    "staminaDelta",
    "spiritDelta",
    "conditionId",
    "conditionName",
    "conditionSeverity",
    "conditionSummary",
    "conditionStatus",
    "fortuneDelta",
    "moralityDelta",
    "deathCauseKind",
    "deathCauseLabel"
  ],
  "destiny-pattern": [],
  "culture-tech": [],
  "time": [],
  "orchestrator": [],
  "narrative-parser": [],
  "summary-compressor": [],
  "subsystem-relevance": [],
  "memory-lifecycle": [],
  "causal-delay": [],
  "plot-structure": [],
  "foreshadowing": [],
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
