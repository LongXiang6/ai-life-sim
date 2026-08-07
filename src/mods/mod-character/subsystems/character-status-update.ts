/**
 * Purpose: Validate and apply one post-narrative character-status operation.
 * Owner: mod-character / character-base
 * Responsibility: Mutate compact health, fortune, morality, and pending-death state only.
 */

import type {
  CharacterConditionState,
  CharacterDeathCauseKind,
  CharacterNarrativeStatus,
  PendingCharacterDeath,
} from '@/foundation'

import {
  refreshCharacterGuidance,
  updateFortune,
  updateMorality,
  upsertCondition,
} from './character-status-runtime'

const DEATH_CAUSES = new Set<CharacterDeathCauseKind>(['story', 'condition', 'trauma', 'life-ending'])

function integer(value: unknown, label: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${label}必须是 ${min} 至 ${max} 的整数`)
  }
  return value
}

function text(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}不能为空`)
  return value.trim()
}

export function applyCharacterStatusUpdate(input: {
  status: CharacterNarrativeStatus
  payload: Record<string, unknown>
  contextId: string
  totalDays: number
  evidenceEventIds: readonly string[]
}): PendingCharacterDeath | undefined {
  const { status, payload } = input
  const meaningfulEntries = Object.entries(payload).filter(([, value]) => value !== undefined)
  if (meaningfulEntries.length === 0) throw new Error('角色状态更新至少需要一个变化字段')
  if (!status.health.alive) throw new Error('已死亡角色不能再接受状态更新')

  const vitalFields = ['vitalityDelta', 'staminaDelta', 'spiritDelta'] as const
  for (const field of vitalFields) {
    const value = payload[field]
    if (value === undefined) continue
    const delta = integer(value, field, -100, 100)
    if (delta === 0) throw new Error(`${field}不能提交零变化`)
    if (field === 'vitalityDelta') {
      status.health.vitality = Math.max(0, Math.min(status.health.maxVitality, status.health.vitality + delta))
    } else if (field === 'staminaDelta') {
      status.health.stamina = Math.max(0, Math.min(100, status.health.stamina + delta))
    } else {
      status.health.spirit = Math.max(0, Math.min(100, status.health.spirit + delta))
    }
  }

  const hasConditionFields = [
    'conditionId', 'conditionName', 'conditionSeverity', 'conditionSummary', 'conditionStatus',
  ].some((field) => payload[field] !== undefined)
  if (hasConditionFields) {
    const requestedId = payload.conditionId === undefined ? undefined : text(payload.conditionId, '健康问题 ID')
    const existing = requestedId
      ? status.health.conditions.find((condition) => condition.conditionId === requestedId)
      : undefined
    const conditionStatus = payload.conditionStatus === undefined
      ? existing?.status ?? 'active'
      : text(payload.conditionStatus, '健康问题状态')
    if (!['active', 'recovering', 'resolved'].includes(conditionStatus)) {
      throw new Error('健康问题状态必须是 active、recovering 或 resolved')
    }
    if (conditionStatus === 'resolved' && !existing) throw new Error('待解决的健康问题不存在')
    const conditionId = existing?.conditionId
      ?? requestedId
      ?? `condition:${encodeURIComponent(status.entityId ?? 'player')}:${input.totalDays}:${status.health.conditions.length}`
    const condition: CharacterConditionState = {
      conditionId,
      contextId: existing?.contextId ?? input.contextId,
      name: payload.conditionName === undefined
        ? existing?.name ?? (() => { throw new Error('新增健康问题必须提供名称') })()
        : text(payload.conditionName, '健康问题名称'),
      severity: payload.conditionSeverity === undefined
        ? existing?.severity ?? (() => { throw new Error('新增健康问题必须提供严重度') })()
        : integer(payload.conditionSeverity, '健康问题严重度', 1, 10),
      summary: payload.conditionSummary === undefined
        ? existing?.summary ?? (() => { throw new Error('新增健康问题必须提供说明') })()
        : text(payload.conditionSummary, '健康问题说明'),
      status: conditionStatus as CharacterConditionState['status'],
      onsetTotalDays: existing?.onsetTotalDays ?? input.totalDays,
      evidenceEventIds: [...new Set([...(existing?.evidenceEventIds ?? []), ...input.evidenceEventIds])],
    }
    upsertCondition(status, condition)
  }

  if (payload.fortuneDelta !== undefined) {
    const delta = integer(payload.fortuneDelta, '气运变化', -20, 20)
    if (delta === 0) throw new Error('气运不能提交零变化')
    updateFortune(status, delta)
  }
  if (payload.moralityDelta !== undefined) {
    const delta = integer(payload.moralityDelta, '道德变化', -20, 20)
    if (delta === 0) throw new Error('道德不能提交零变化')
    updateMorality(status, delta)
  }

  const hasDeathKind = payload.deathCauseKind !== undefined
  const hasDeathLabel = payload.deathCauseLabel !== undefined
  if (hasDeathKind !== hasDeathLabel) throw new Error('死亡原因类型与说明必须同时提交')
  let pendingDeath: PendingCharacterDeath | undefined
  if (hasDeathKind && hasDeathLabel) {
    const causeKind = text(payload.deathCauseKind, '死亡原因类型') as CharacterDeathCauseKind
    if (!DEATH_CAUSES.has(causeKind)) throw new Error('死亡原因类型无效')
    pendingDeath = {
      entityId: status.entityId ?? 'player:current',
      contextId: input.contextId,
      causeKind,
      causeLabel: text(payload.deathCauseLabel, '死亡原因说明'),
      occurredAtTotalDays: input.totalDays,
      finalAgeDays: status.ageDays,
    }
    status.health.alive = false
    status.health.vitality = 0
  }

  status.health.updatedAtTotalDays = input.totalDays
  status.lastAnalyzedAtTotalDays = input.totalDays
  Object.assign(status, refreshCharacterGuidance(status))
  return pendingDeath
}
