import { BaseSubsystem } from '@/core'
import {
  REPUTATION_SYSTEM_OPERATION_FIELDS,
  type ReputationChangeRecord,
  type ReputationEvaluation,
  type ReputationScope,
  type ReputationSystemPersistenceState,
  type RoundContext,
  type SubSystemChanges,
  type SubSystemState,
} from '@/foundation'
import { getWorldEntityReference } from '@/mods/mod-world'

import {
  assertEntityVisible,
  assertKnownKeys,
  clone,
  isRecord,
  normalizeReputationScope,
  requireInteger,
  requireString,
  requireStringList,
  requireTotalDays,
  validateEvidence,
  validateStoredReputationScope,
} from '../utils'

function scopeKey(scope: ReputationScope): string {
  if (scope.kind === 'entity') return `entity:${scope.evaluatorEntityId}`
  if (scope.kind === 'context') return `context:${scope.contextId}`
  return 'global'
}

function reputationId(subjectEntityId: string, scope: ReputationScope, dimension: string): string {
  return `reputation:${encodeURIComponent(subjectEntityId)}:${encodeURIComponent(scopeKey(scope))}:${encodeURIComponent(dimension.toLowerCase())}`
}

function validateEvaluation(value: unknown, index: number): ReputationEvaluation {
  if (!isRecord(value)) throw new Error(`evaluations[${index}]必须是对象`)
  assertKnownKeys(value, ['reputationId', 'subjectEntityId', 'scope', 'dimension', 'score', 'updatedAtTotalDays'], `evaluations[${index}]`)
  return {
    reputationId: requireString(value.reputationId, `evaluations[${index}].reputationId`),
    subjectEntityId: requireString(value.subjectEntityId, `evaluations[${index}].subjectEntityId`),
    scope: validateStoredReputationScope(value.scope, `evaluations[${index}].scope`),
    dimension: requireString(value.dimension, `evaluations[${index}].dimension`),
    score: requireInteger(value.score, `evaluations[${index}].score`, -100, 100),
    updatedAtTotalDays: requireTotalDays(value.updatedAtTotalDays, `evaluations[${index}].updatedAtTotalDays`),
  }
}

function validateChangeRecord(value: unknown, index: number): ReputationChangeRecord {
  if (!isRecord(value)) throw new Error(`changes[${index}]必须是对象`)
  assertKnownKeys(value, [
    'changeId', 'reputationId', 'subjectEntityId', 'scope', 'dimension', 'delta',
    'description', 'occurredAtTotalDays', 'evidenceEventIds',
  ], `changes[${index}]`)
  return {
    changeId: requireString(value.changeId, `changes[${index}].changeId`),
    reputationId: requireString(value.reputationId, `changes[${index}].reputationId`),
    subjectEntityId: requireString(value.subjectEntityId, `changes[${index}].subjectEntityId`),
    scope: validateStoredReputationScope(value.scope, `changes[${index}].scope`),
    dimension: requireString(value.dimension, `changes[${index}].dimension`),
    delta: requireInteger(value.delta, `changes[${index}].delta`, -100, 100),
    description: requireString(value.description, `changes[${index}].description`),
    occurredAtTotalDays: requireTotalDays(value.occurredAtTotalDays, `changes[${index}].occurredAtTotalDays`),
    evidenceEventIds: requireStringList(value.evidenceEventIds, `changes[${index}].evidenceEventIds`),
  }
}

function validatePersistenceState(value: unknown): ReputationSystemPersistenceState {
  if (!isRecord(value)) throw new Error('声望持久化快照必须是对象')
  assertKnownKeys(value, ['schemaVersion', 'evaluations', 'changes'], '声望持久化快照')
  if (value.schemaVersion !== 1 || !Array.isArray(value.evaluations) || !Array.isArray(value.changes)) {
    throw new Error('声望持久化快照结构无效')
  }
  const evaluations = value.evaluations.map(validateEvaluation)
  const changes = value.changes.map(validateChangeRecord)
  if (new Set(evaluations.map((item) => item.reputationId)).size !== evaluations.length) throw new Error('声望评价 ID 重复')
  if (new Set(changes.map((item) => item.changeId)).size !== changes.length) throw new Error('声望变化 ID 重复')
  return { schemaVersion: 1, evaluations, changes }
}

function visibleInContext(evaluation: ReputationEvaluation, contextId: string): boolean {
  if (evaluation.scope.kind === 'global') return true
  if (evaluation.scope.kind === 'context') return evaluation.scope.contextId === contextId
  const evaluator = evaluation.scope.evaluatorEntityId
    ? getWorldEntityReference(evaluation.scope.evaluatorEntityId)
    : undefined
  return evaluator?.contextIds.includes(contextId) ?? false
}

export class ReputationSystem extends BaseSubsystem {
  readonly id = 'reputation' as const
  readonly mod = 'mod-progression' as const
  readonly label = '分域声望' as const
  readonly description = '按评价人物、世界上下文或全局评价域拥有人物声望维度与历史依据' as const

  private state: ReputationSystemPersistenceState = { schemaVersion: 1, evaluations: [], changes: [] }

  collectState(context: RoundContext): SubSystemState {
    const evaluations = this.state.evaluations.filter((item) => item.subjectEntityId === context.characterId && visibleInContext(item, context.contextId))
    const changes = this.state.changes.filter((item) => item.subjectEntityId === context.characterId).slice(-20)
    const score = evaluations.length === 0
      ? 0
      : Math.round(evaluations.reduce((sum, item) => sum + item.score, 0) / evaluations.length)
    const dimensions = evaluations.slice(0, 8).map((item) => `${item.dimension}:${item.score}`).join('、')
    return {
      id: this.id,
      summary: `【${this.label}】当前可见评价 ${evaluations.length} 项，综合 ${score}${dimensions ? `（${dimensions}）` : ''}`,
      data: structuredClone({
        contextId: context.contextId,
        subjectEntityId: context.characterId,
        score,
        evaluations,
        changes,
      }),
    }
  }

  preflightChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (!changes || changes.id !== this.id) throw new Error('声望系统指令目标不匹配')
    if (!changes.description?.trim()) throw new Error('声望系统指令说明不能为空')
    if (changes.targetContextId !== context.contextId) throw new Error('声望系统目标上下文不是当前上下文')
    if (changes.operation !== 'adjust') throw new Error(`声望系统操作无效：${changes.operation ?? ''}`)
    if (!isRecord(changes.changes)) throw new Error('声望系统指令变更必须是对象')
    assertKnownKeys(changes.changes, REPUTATION_SYSTEM_OPERATION_FIELDS.adjust, '声望调整')
    const subjectEntityId = requireString(changes.targetObjectId, '声望主体')
    assertEntityVisible(subjectEntityId, context.contextId)
    const scope = normalizeReputationScope(
      changes.changes.scopeKind,
      changes.changes.evaluatorEntityId,
      changes.changes.scopeContextId,
      context.contextId,
    )
    const dimension = requireString(changes.changes.dimension, '声望维度')
    const delta = requireInteger(changes.changes.delta, '声望变化', -100, 100)
    if (delta === 0) throw new Error('声望变化不能为零')
    validateEvidence(changes.evidenceEventIds, context.contextId, '声望依据事件')
    const id = reputationId(subjectEntityId, scope, dimension)
    const current = this.state.evaluations.find((item) => item.reputationId === id)?.score ?? 0
    requireInteger(current + delta, '调整后声望', -100, 100)
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (!changes || typeof changes !== 'object') throw new Error('声望系统指令必须是对象')
    if (changes.id !== this.id) throw new Error('声望系统指令目标不匹配')
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) {
      throw new Error('声望系统指令变更必须是对象')
    }
    if (!changes.description || changes.description.trim() === '') throw new Error('声望系统指令说明不能为空')
    const payload = changes.changes
    this.preflightChanges(changes, context)
    const subjectEntityId = changes.targetObjectId as string
    const scope = normalizeReputationScope(
      payload.scopeKind,
      payload.evaluatorEntityId,
      payload.scopeContextId,
      context.contextId,
    )
    const dimension = (payload.dimension as string).trim()
    const delta = payload.delta as number
    const id = reputationId(subjectEntityId, scope, dimension)
    const index = this.state.evaluations.findIndex((item) => item.reputationId === id)
    const current = index < 0 ? 0 : this.state.evaluations[index].score
    const evaluation: ReputationEvaluation = {
      reputationId: id,
      subjectEntityId,
      scope,
      dimension,
      score: current + delta,
      updatedAtTotalDays: context.totalDays,
    }
    if (index < 0) this.state.evaluations.push(evaluation)
    else this.state.evaluations[index] = evaluation
    this.state.changes.push({
      changeId: `reputation-change:${encodeURIComponent(id)}:${context.totalDays}:${this.state.changes.length}`,
      reputationId: id,
      subjectEntityId,
      scope,
      dimension,
      delta,
      description: changes.description.trim(),
      occurredAtTotalDays: context.totalDays,
      evidenceEventIds: [...(changes.evidenceEventIds ?? [])],
    })
  }

  listEvaluations(subjectEntityId: string): ReputationEvaluation[] {
    return clone(this.state.evaluations.filter((item) => item.subjectEntityId === subjectEntityId))
  }

  capturePersistenceState(): ReputationSystemPersistenceState {
    return validatePersistenceState(clone(this.state))
  }

  restorePersistenceState(snapshot: unknown): void {
    this.state = snapshot === undefined
      ? { schemaVersion: 1, evaluations: [], changes: [] }
      : validatePersistenceState(snapshot)
  }

  reset(): void {
    this.state = { schemaVersion: 1, evaluations: [], changes: [] }
  }
}

let runtimeReputationSystem: ReputationSystem | undefined

export function getReputationSystem(): ReputationSystem {
  runtimeReputationSystem ??= new ReputationSystem()
  return runtimeReputationSystem
}
