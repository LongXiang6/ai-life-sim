/**
 * @module index.ts
 * @description Foundation 跨域数据契约聚合导出 —— 子系统间通过 BaseSubsystem.readSubsystem<T>() 类型安全读取彼此数据
 * @mod foundation
 *
 * 背景：模拟系统全面重写梯队一（`ai-life-sim/docs/simulation-rewrite-architecture.md` §三、
 * `.agents/skills/ai-life-sim-mod-development/references/mod-spec-subsystem-contracts.md`）。
 *
 * 使用约定：
 * - 每个会被其他子系统引用的子系统，在此目录下建一个 `{子系统id}.contract.ts` 文件，
 *   导出该子系统对外暴露的数据结构接口（纯类型，不含运行时逻辑）
 * - 契约文件仅由编写该子系统的一方维护，消费方只读不写
 * - 契约是 TypeScript 编译期约束，运行时不做 schema 校验——区别于 AI 响应用 Zod 强校验
 *
 * 契约生成时机：清空代码时不需创建所有契约，只创建第一梯队会用到的；
 * 恢复每个子系统时同步创建它的契约文件（此文件目前为空聚合入口，随恢复进度追加 export）。
 */

export type {
  WorldContextId,
  GlobalEntityId,
  SpatialNodeId,
  SpatialEdgeId,
  WorldContextKind,
  WorldContextLifecycle,
  SimulationScope,
  ContextCapability,
  LocalCalendarProfile,
  LocalClockState,
  WorldContextRecord,
  ContextCapabilityProfile,
  SpatialNode,
  SpatialEdgeKind,
  SpatialEdge,
  EntitySpatialLocation,
  SpatialGraphContract,
  SimulationScopeRecord,
  ContextTransitionRequest,
  ContextTransitionRecord,
  ContextTransitionResult,
  WorldContextRegistryContract,
  ContextCapabilityProfileContract,
  SimulationScopePolicyContract,
} from './world-context.contract'

export type {
  HistoricalEventId,
  HistoricalEventEvidenceId,
  HistoricalCausalEdgeId,
  HistoricalEventCandidateId,
  HistoricalEventStatus,
  HistoricalEventScopeKind,
  HistoricalEventScope,
  HistoricalEntityReference,
  HistoricalLocationReference,
  HistoricalEventSchedule,
  HistoricalEventSourceKind,
  HistoricalEventSource,
  HistoricalEventRecord,
  HistoricalEventTransition,
  HistoricalEventEvidenceKind,
  HistoricalEventEvidence,
  HistoricalCausalRelation,
  HistoricalCausalEdge,
  HistoricalEventCandidate,
  HistoricalEventCandidateAuditStatus,
  HistoricalEventCandidateAudit,
  HistoricalEventMigrationMetadata,
  HistoricalEventLedgerPersistenceState,
  HistoricalEventView,
  HistoricalEventLedgerContract,
  HistoricalEventCreateInput,
  HistoricalEventTransitionInput,
  HistoricalEventEvidenceInput,
  HistoricalCausalEdgeInput,
  HistoricalEventCommitBatch,
  HistoricalEventValidationContext,
  HistoricalEventPreparedAppend,
  HistoricalEventPreflightResult,
  HistoricalEventCommitResult,
  HistoricalQueryWindow,
  HistoricalEventQuery,
  HistoricalCausalEdgeQuery,
  HistoricalEventEvidenceQuery,
  HistoricalEventTransitionQuery,
  HistoricalEventMigrationQuery,
  HistoricalEventDetailsQuery,
  HistoricalEventDetails,
  HistoricalEventCandidateInput,
  HistoricalEventCandidateSubmission,
  HistoricalEventCandidateQuery,
  HistoricalCausalCommitmentInput,
} from './historical-event.contract'

export type {
  EntityReferenceKind,
  EntityReference,
  EntityReferenceDirectoryPersistenceState,
  NpcAvailability,
  NpcIdentity,
  NpcContextState,
  NpcGoalStatus,
  NpcGoal,
  NpcBehaviorRecord,
  NpcMemorySourceKind,
  NpcMemory,
  NpcMemoryCompression,
  NpcSystemPersistenceState,
  NpcSystemInstructionOperation,
  RelationshipScopeKind,
  RelationshipScope,
  RelationshipStatus,
  RelationshipRecord,
  RelationshipTransitionOperation,
  RelationshipTransition,
  RelationshipSystemPersistenceState,
  NpcSystemInstruction,
  RelationshipSystemInstruction,
} from './npc-social.contract'

export {
  NPC_SYSTEM_OPERATION_FIELDS,
  RELATIONSHIP_SYSTEM_OPERATION_FIELDS,
} from './npc-social.contract'

export type {
  TerrainClass,
  NodeGeographyRecord,
  GeographyChangeRecord,
  GeographyPersistenceState,
  GeographyMutationInput,
  ResourceDepositStatus,
  NaturalResourceDeposit,
  NaturalResourceTransaction,
  NaturalResourcePersistenceState,
  NaturalResourceDepositInput,
  NaturalResourceTransactionInput,
  MapProjectionKind,
  MapProjectionVisibility,
  MapProjectionNode,
  MapProjectionEdge,
  MapProjection,
  MapProjectionRequest,
} from './spatial-environment.contract'

export type {
  ProgressionScopeKind,
  ProgressionScope,
  SkillMastery,
  GrowthSkill,
  AbilityStatus,
  StableAbility,
  GrowthRecord,
  GrowthSystemPersistenceState,
  GrowthSystemInstructionOperation,
  AchievementScopeKind,
  AchievementEventCriteria,
  AchievementDefinition,
  AchievementProgress,
  AchievementUnlock,
  AchievementSystemPersistenceState,
  ReputationScopeKind,
  ReputationScope,
  ReputationEvaluation,
  ReputationChangeRecord,
  ReputationSystemPersistenceState,
  ReputationSystemInstructionOperation,
} from './progression.contract'

export {
  GROWTH_SYSTEM_OPERATION_FIELDS,
  REPUTATION_SYSTEM_OPERATION_FIELDS,
} from './progression.contract'

export type {
  CharacterAttributeKey,
  CharacterAttributeModifiers,
  BiologicalClockMode,
  LifespanRuleProfile,
  LifespanAdjustment,
  LifespanSystemPersistenceState,
  LifespanSystemInstructionOperation,
  LifecycleNarrativeArchetype,
  LifecycleStageDefinition,
  LifecycleRuleProfile,
  EntityLifecycleState,
  LifecycleTransitionRecord,
  LifecycleSystemPersistenceState,
  HealthConditionKind,
  HealthConditionStatus,
  HealthCondition,
  ContextHealthRule,
  DeathCauseKind,
  PendingDeathFact,
  DeathOutcome,
  EntityHealthState,
  HealthSystemPersistenceState,
  HealthSystemInstructionOperation,
} from './life-cycle.contract'

export {
  CHARACTER_DAYS_PER_YEAR,
  resolveCharacterAgeDays,
  resolveInitialAgeAnchorTotalDays,
  LIFESPAN_SYSTEM_OPERATION_FIELDS,
  HEALTH_SYSTEM_OPERATION_FIELDS,
} from './life-cycle.contract'

export type {
  MonetaryMode,
  WorldScaleCalibration,
} from './world-scale.contract'

export type {
  PowerFrameworkProgression,
  PowerFrameworkSource,
  PowerRankDefinition,
  PowerFrameworkDefinition,
  PowerFrameworkProposal,
} from './power-framework.contract'
