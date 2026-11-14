/**
 * Purpose: Commit destiny-pattern growth across the character owner and its narrative projection.
 * Owner: mod-character
 * Responsibility: Cross-owner preflight, deterministic commit order, and rollback on a rejected local transaction.
 */

import type {
  NarrativeDestinyPatternGrowthPattern,
  NarrativeDestinyPatternGrowthProjection,
} from '@/mods/mod-engine'
import { ensureOrchestratorContextFromStores, orchestrator } from '@/mods/mod-engine/engine-api'

import type {
  DestinyPatternGrowthSource,
  DestinyPatternGrowthHistoryEntry,
  PendingDestinyPatternGrowth,
  ReincarnationTalent,
} from './types'
import {
  registerPendingDestinyPatternGrowthInState,
  recordDestinyPatternGrowthAssessmentsInState,
  recordDestinyPatternGrowthEvidenceInState,
  resolvePendingDestinyPatternGrowthInState,
} from './destiny-pattern-growth'
import { useCharacterStore } from './store'
import { getDestinyPatternSystem } from './subsystems/destiny-pattern-system'
import type { DestinyPatternGrowthEvidence } from './types'

function samePendingGrowth(
  left: PendingDestinyPatternGrowth | null,
  right: PendingDestinyPatternGrowth | null,
): boolean {
  if (!left || !right) return left === right
  return left.choiceId === right.choiceId
    && left.narrativeId === right.narrativeId
    && left.lineageId === right.lineageId
    && left.opportunityKind === right.opportunityKind
    && left.source.id === right.source.id
    && left.source.version === right.source.version
    && left.options[0].optionId === right.options[0].optionId
    && left.options[1].optionId === right.options[1].optionId
    && left.options[2].optionId === right.options[2].optionId
}

function sameGrowthResult(
  left: DestinyPatternGrowthHistoryEntry,
  right: DestinyPatternGrowthHistoryEntry,
): boolean {
  return left.choiceId === right.choiceId
    && left.selectedOptionId === right.selectedOptionId
    && left.result.id === right.result.id
    && left.result.lineageId === right.result.lineageId
    && left.result.version === right.result.version
    && left.result.aptitudeTier === right.result.aptitudeTier
    && left.result.developmentStage === right.result.developmentStage
}

function projectPattern(pattern: DestinyPatternGrowthSource): NarrativeDestinyPatternGrowthPattern {
  return {
    name: pattern.name,
    aptitudeTier: pattern.aptitudeTier,
    developmentStage: pattern.developmentStage,
    ...('apexStrengthenLevel' in pattern ? { apexStrengthenLevel: pattern.apexStrengthenLevel } : {}),
    description: pattern.description,
    effect: pattern.effect,
    attrBonus: { ...pattern.attrBonus },
  }
}

function projectPendingGrowth(
  pending: PendingDestinyPatternGrowth,
): NarrativeDestinyPatternGrowthProjection {
  return {
    choiceId: pending.choiceId,
    lineageId: pending.lineageId,
    source: projectPattern(pending.source),
    options: pending.options.map((option) => ({
      optionId: option.optionId,
      route: option.route,
      ...projectPattern(option.pattern),
    })) as NarrativeDestinyPatternGrowthProjection['options'],
    ...(pending.opportunityKind ? { opportunityKind: pending.opportunityKind } : {}),
  }
}

function restoreCharacterGrowthState(
  runtimeState: ReturnType<ReturnType<typeof getDestinyPatternSystem>['getStateSnapshot']>,
  storeState: ReturnType<typeof useCharacterStore.getState>['destinyPatterns'],
  equippedReincarnationTalents: readonly ReincarnationTalent[],
): void {
  useCharacterStore.setState({
    equippedReincarnationTalents: structuredClone([...equippedReincarnationTalents]),
  })
  getDestinyPatternSystem().restoreCollectedState(runtimeState)
  useCharacterStore.setState({ destinyPatterns: structuredClone(storeState) })
  orchestrator.refreshCommittedSubsystemStateSnapshot()
}

export interface PreparedDestinyPatternGrowthChoice {
  readonly pending: PendingDestinyPatternGrowth
}

export interface DestinyPatternGrowthTransactionSnapshot {
  readonly narrativeId: string
  readonly runtimeState: ReturnType<ReturnType<typeof getDestinyPatternSystem>['getStateSnapshot']>
  readonly storeState: ReturnType<typeof useCharacterStore.getState>['destinyPatterns']
  readonly equippedReincarnationTalents: ReincarnationTalent[]
  readonly narrativeProjection?: NarrativeDestinyPatternGrowthProjection
}

/** 记录主故事已经明确给出的命格使用证据，不触发 AI，也不登记成长路线。 */
export function recordDestinyPatternGrowthEvidence(
  evidence: readonly DestinyPatternGrowthEvidence[],
): void {
  if (evidence.length === 0) return
  const system = getDestinyPatternSystem()
  const equippedReincarnationTalents = useCharacterStore.getState().equippedReincarnationTalents
  const runtimeState = recordDestinyPatternGrowthEvidenceInState(
    system.getStateSnapshot(),
    evidence,
    equippedReincarnationTalents,
  )
  const storeState = recordDestinyPatternGrowthEvidenceInState(
    useCharacterStore.getState().destinyPatterns,
    evidence,
    equippedReincarnationTalents,
  )
  system.restoreCollectedState(runtimeState)
  useCharacterStore.setState({ destinyPatterns: structuredClone(storeState) })
  orchestrator.refreshCommittedSubsystemStateSnapshot()
}

/** 记录一次已经完成的成长复评水位；不改变当前命格或玩家选择。 */
export function recordDestinyPatternGrowthAssessments(
  assessments: readonly import('./types').DestinyPatternGrowthAssessment[],
): void {
  if (assessments.length === 0) return
  const system = getDestinyPatternSystem()
  const runtimeState = recordDestinyPatternGrowthAssessmentsInState(system.getStateSnapshot(), assessments)
  const storeState = recordDestinyPatternGrowthAssessmentsInState(
    useCharacterStore.getState().destinyPatterns,
    assessments,
  )
  system.restoreCollectedState(runtimeState)
  useCharacterStore.setState({ destinyPatterns: structuredClone(storeState) })
  orchestrator.refreshCommittedSubsystemStateSnapshot()
}

/** Validate the complete growth package without mutating character or narrative state. */
export function prepareDestinyPatternGrowthChoice(
  pending: PendingDestinyPatternGrowth,
): PreparedDestinyPatternGrowthChoice {
  const system = getDestinyPatternSystem()
  const runtimeBefore = system.getStateSnapshot()
  const characterState = useCharacterStore.getState()
  const storeBefore = structuredClone(characterState.destinyPatterns)
  if (!samePendingGrowth(runtimeBefore.pendingGrowth, storeBefore.pendingGrowth)) {
    throw new Error('天赋成长运行时与角色存档状态不一致')
  }
  const runtimePreview = registerPendingDestinyPatternGrowthInState(
    runtimeBefore,
    pending,
    characterState.age,
    characterState.equippedReincarnationTalents,
  )
  const storePreview = registerPendingDestinyPatternGrowthInState(
    storeBefore,
    pending,
    characterState.age,
    characterState.equippedReincarnationTalents,
  )
  if (!samePendingGrowth(runtimePreview.pendingGrowth, storePreview.pendingGrowth)) {
    throw new Error('天赋成长登记无法形成唯一结果')
  }
  orchestrator.assertDestinyPatternGrowthProjectionRegistration(
    pending.narrativeId,
    projectPendingGrowth(pending),
  )
  return { pending: structuredClone(pending) }
}

export function captureDestinyPatternGrowthTransaction(
  narrativeId: string,
): DestinyPatternGrowthTransactionSnapshot {
  return {
    narrativeId,
    runtimeState: getDestinyPatternSystem().getStateSnapshot(),
    storeState: structuredClone(useCharacterStore.getState().destinyPatterns),
    equippedReincarnationTalents: structuredClone(useCharacterStore.getState().equippedReincarnationTalents),
    narrativeProjection: orchestrator.captureDestinyPatternGrowthProjection(narrativeId),
  }
}

/** Commit a prepared AI growth decision through the character owner. */
export function commitPreparedDestinyPatternGrowthChoice(
  prepared: PreparedDestinyPatternGrowthChoice,
): void {
  const pending = structuredClone(prepared.pending)
  const system = getDestinyPatternSystem()
  system.registerPendingGrowth(pending)
  useCharacterStore.getState().registerPendingDestinyPatternGrowth(pending)
  orchestrator.refreshCommittedSubsystemStateSnapshot()
  orchestrator.registerDestinyPatternGrowthProjection(
    pending.narrativeId,
    projectPendingGrowth(pending),
  )
}

export function restoreDestinyPatternGrowthTransaction(
  snapshot: DestinyPatternGrowthTransactionSnapshot,
): void {
  restoreCharacterGrowthState(
    snapshot.runtimeState,
    snapshot.storeState,
    snapshot.equippedReincarnationTalents,
  )
  orchestrator.restoreDestinyPatternGrowthProjection(
    snapshot.narrativeId,
    snapshot.narrativeProjection,
  )
}

/** 登记由天赋成长 AI 形成并经本地裁决的完整三选一。 */
export function registerDestinyPatternGrowthChoice(
  pending: PendingDestinyPatternGrowth,
): void {
  const prepared = prepareDestinyPatternGrowthChoice(pending)
  const snapshot = captureDestinyPatternGrowthTransaction(pending.narrativeId)

  try {
    commitPreparedDestinyPatternGrowthChoice(prepared)
  } catch (error) {
    restoreDestinyPatternGrowthTransaction(snapshot)
    throw error
  }
}

export type ResolveDestinyPatternGrowthChoiceResult =
  | { ok: true; historyEntry: DestinyPatternGrowthHistoryEntry }
  | { ok: false; error: string }

/** 玩家确认一个成长方向；此命令不调用 AI。 */
export function resolveDestinyPatternGrowthChoice(
  optionId: string,
): ResolveDestinyPatternGrowthChoiceResult {
  if (!ensureOrchestratorContextFromStores()) {
    return { ok: false, error: '当前人生上下文尚未恢复，请刷新页面后重试。' }
  }
  const system = getDestinyPatternSystem()
  const runtimeBefore = system.getStateSnapshot()
  const storeBefore = structuredClone(useCharacterStore.getState().destinyPatterns)
  if (!samePendingGrowth(runtimeBefore.pendingGrowth, storeBefore.pendingGrowth)) {
    return { ok: false, error: '天赋成长运行时与角色存档状态不一致' }
  }
  const pending = runtimeBefore.pendingGrowth
  if (!pending) return { ok: false, error: '当前没有等待选择的天赋成长' }
  const committedAt = Date.now()
  const totalBasePoints = orchestrator.getRoundContextSnapshot().totalBasePoints
  const equippedReincarnationTalents = useCharacterStore.getState().equippedReincarnationTalents

  try {
    const runtimePreview = resolvePendingDestinyPatternGrowthInState(
      runtimeBefore,
      optionId,
      committedAt,
      totalBasePoints,
      equippedReincarnationTalents,
    )
    const storePreview = resolvePendingDestinyPatternGrowthInState(
      storeBefore,
      optionId,
      committedAt,
      totalBasePoints,
      equippedReincarnationTalents,
    )
    if (!sameGrowthResult(runtimePreview.historyEntry, storePreview.historyEntry)) {
      throw new Error('天赋成长选择无法形成唯一结果')
    }
    if (
      JSON.stringify(runtimePreview.reincarnationTalents ?? equippedReincarnationTalents)
      !== JSON.stringify(storePreview.reincarnationTalents ?? equippedReincarnationTalents)
    ) {
      throw new Error('轮回天赋成长无法形成唯一结果')
    }
    orchestrator.assertDestinyPatternGrowthChoice(
      pending.narrativeId,
      pending.choiceId,
      optionId,
    )

    const historyEntry = system.resolvePendingGrowth(
      optionId,
      committedAt,
      totalBasePoints,
      equippedReincarnationTalents,
    )
    useCharacterStore.setState({ destinyPatterns: storePreview.state })
    if (storePreview.reincarnationTalents) {
      useCharacterStore.setState({
        equippedReincarnationTalents: storePreview.reincarnationTalents,
      })
    }
    orchestrator.refreshCommittedSubsystemStateSnapshot()
    orchestrator.resolveDestinyPatternGrowthProjection(
      pending.narrativeId,
      pending.choiceId,
      optionId,
    )
    return { ok: true, historyEntry }
  } catch (error) {
    try {
      restoreCharacterGrowthState(runtimeBefore, storeBefore, equippedReincarnationTalents)
    } catch {
      // The original transaction error remains the actionable failure.
    }
    return {
      ok: false,
      error: error instanceof Error ? error.message : '天赋成长选择失败',
    }
  }
}
