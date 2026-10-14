/**
 * Purpose: Own conditional narrative planning state and trigger decisions.
 * Owner: mod-engine
 * Responsibility: Persist reusable abstract guidance; never promote candidates into facts.
 */

import type {
  NarrativeBirthProfile,
  NarrativeControlPlaneView,
  NarrativeDirectionHint,
  NarrativeEventCandidate,
  NarrativeLifePlan,
  NarrativeWorldTimelineCommitment,
} from '@/foundation'
import {
  baseFingerprint,
  birthFingerprint,
  timelineFingerprint,
  type NarrativeControlTriggerInput,
} from './narrative-control-plane-input'
import {
  normalizeBirthProfile,
  normalizeDirections,
  normalizeEvents,
  normalizeLifePlan,
  normalizeTimeline,
} from './narrative-control-plane-normalizers'

export type NarrativeControlCallKind = 'birth' | 'plan' | 'direction' | 'event' | 'timeline'

export interface NarrativeControlPlanePersistenceState {
  schemaVersion: 1
  birthProfile?: NarrativeBirthProfile
  lifePlan?: NarrativeLifePlan
  directionHints: NarrativeDirectionHint[]
  eventCandidates: NarrativeEventCandidate[]
  timelineCommitments: NarrativeWorldTimelineCommitment[]
  directionPoolFingerprint?: string
  eventPoolFingerprint?: string
  timelineGenerationFingerprint?: string
  lastSelectedDirectionId?: string
  lastSelectedEventId?: string
}

export interface NarrativeControlTrigger {
  kind: NarrativeControlCallKind
  fingerprint: string
  reason: string
}

export interface NarrativeControlPreparation {
  triggers: NarrativeControlTrigger[]
  fingerprint: string
  view: NarrativeControlPlaneView
}

export { buildNarrativeControlInput } from './narrative-control-plane-input'
export type { NarrativeControlTriggerInput } from './narrative-control-plane-input'

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function activeSource<T extends { sourceFingerprint: string }>(
  items: readonly T[],
  fingerprint: string,
): T[] {
  return items.filter((item) => item.sourceFingerprint === fingerprint)
}

function selectOne<T extends { id: string }>(items: readonly T[], selectionKey: string): T[] {
  if (items.length <= 1) return [...items]
  const source = `${selectionKey}|${items.map((item) => item.id).join('|')}`
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return [items[Math.abs(hash) % items.length]!]
}

export class NarrativeControlPlane {
  private state: NarrativeControlPlanePersistenceState = {
    schemaVersion: 1,
    directionHints: [],
    eventCandidates: [],
    timelineCommitments: [],
  }

  reset(): void {
    this.state = {
      schemaVersion: 1,
      directionHints: [],
      eventCandidates: [],
      timelineCommitments: [],
    }
  }

  capturePersistenceState(): NarrativeControlPlanePersistenceState {
    return structuredClone(this.state)
  }

  getBirthProfile(): NarrativeBirthProfile | undefined {
    return this.state.birthProfile ? structuredClone(this.state.birthProfile) : undefined
  }

  restorePersistenceState(snapshot: unknown): void {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      this.reset()
      return
    }
    const source = snapshot as Partial<NarrativeControlPlanePersistenceState>
    const directionHints = Array.isArray(source.directionHints)
      ? structuredClone(source.directionHints)
      : []
    const eventCandidates = Array.isArray(source.eventCandidates)
      ? structuredClone(source.eventCandidates)
      : []
    const timelineCommitments = Array.isArray(source.timelineCommitments)
      ? structuredClone(source.timelineCommitments)
      : []
    const directionPoolFingerprint = text(source.directionPoolFingerprint)
      || directionHints[0]?.sourceFingerprint
    const eventPoolFingerprint = text(source.eventPoolFingerprint)
      || eventCandidates[0]?.sourceFingerprint
    const timelineGenerationFingerprint = text(source.timelineGenerationFingerprint)
      || timelineCommitments.find((item) => (
        item.触发状态 !== 'consumed' && item.触发状态 !== 'invalidated'
      ))?.sourceFingerprint
    this.state = {
      schemaVersion: 1,
      ...(source.birthProfile ? { birthProfile: structuredClone(source.birthProfile) } : {}),
      ...(source.lifePlan ? { lifePlan: structuredClone(source.lifePlan) } : {}),
      directionHints,
      eventCandidates,
      timelineCommitments,
      ...(directionPoolFingerprint ? { directionPoolFingerprint } : {}),
      ...(eventPoolFingerprint ? { eventPoolFingerprint } : {}),
      ...(timelineGenerationFingerprint ? { timelineGenerationFingerprint } : {}),
      ...(text(source.lastSelectedDirectionId) ? { lastSelectedDirectionId: text(source.lastSelectedDirectionId) } : {}),
      ...(text(source.lastSelectedEventId) ? { lastSelectedEventId: text(source.lastSelectedEventId) } : {}),
    }
  }

  inspect(input: NarrativeControlTriggerInput): NarrativeControlPreparation {
    const fingerprint = baseFingerprint(input)
    const birthSourceFingerprint = birthFingerprint(input)
    const timelineSource = timelineFingerprint(input)
    const triggers: NarrativeControlTrigger[] = []
    if (!this.state.birthProfile || this.state.birthProfile.sourceFingerprint !== birthSourceFingerprint) {
      triggers.push({
        kind: 'birth',
        fingerprint: birthSourceFingerprint,
        reason: this.state.birthProfile ? '世界或角色起点发生变化' : '新人生缺少结构化出生背景',
      })
    }
    const hasCurrentPlan = this.state.lifePlan?.sourceFingerprint === fingerprint
    if (!hasCurrentPlan) {
      triggers.push({
        kind: 'plan',
        fingerprint,
        reason: this.state.lifePlan ? '人生阶段或玩家意图发生变化' : '当前人生缺少阶段规划',
      })
    }
    if (hasCurrentPlan) {
      if (this.state.directionPoolFingerprint !== fingerprint) {
        triggers.push({ kind: 'direction', fingerprint, reason: '当前规划没有可复用的方向池' })
      }
      if (this.state.eventPoolFingerprint !== fingerprint) {
        triggers.push({ kind: 'event', fingerprint, reason: '当前阶段没有可适用的抽象事件池' })
      }
    }
    if (this.state.timelineGenerationFingerprint !== timelineSource) {
      triggers.push({ kind: 'timeline', fingerprint: timelineSource, reason: '当前世界缺少有效的未来承诺' })
    }

    const currentAge = Number(
      (input.subsystemStates['character-base']?.data as Record<string, unknown> | undefined)
        ?.status
      && (((input.subsystemStates['character-base']?.data as Record<string, unknown>).status as Record<string, unknown>).ageDays),
    )
    const ageYears = Number.isFinite(currentAge) ? Math.max(0, Math.floor(currentAge / 365)) : 0
    for (const commitment of this.state.timelineCommitments) {
      if (
        commitment.sourceFingerprint === timelineSource
        && commitment.触发状态 === 'scheduled'
        && ageYears >= commitment.目标年龄
      ) {
        commitment.触发状态 = 'due'
      }
    }

    return {
      triggers,
      fingerprint,
      view: this.getView(ageYears, fingerprint, timelineSource, String(input.context.roundSequence)),
    }
  }

  commitBirth(value: unknown, fingerprint: string): void {
    this.state.birthProfile = normalizeBirthProfile(value, fingerprint)
  }

  commitPlan(value: unknown, fingerprint: string): void {
    this.state.lifePlan = normalizeLifePlan(value, fingerprint)
    this.state.directionHints = []
    this.state.eventCandidates = []
    this.state.directionPoolFingerprint = undefined
    this.state.eventPoolFingerprint = undefined
  }

  commitDirections(value: unknown, fingerprint: string): void {
    this.state.directionHints = normalizeDirections(value, fingerprint)
    this.state.directionPoolFingerprint = fingerprint
  }

  commitEvents(value: unknown, fingerprint: string): void {
    this.state.eventCandidates = normalizeEvents(value, fingerprint)
    this.state.eventPoolFingerprint = fingerprint
  }

  commitTimeline(value: unknown, fingerprint: string): void {
    this.state.timelineCommitments = [
      ...this.state.timelineCommitments.filter((item) => (
        item.sourceFingerprint !== fingerprint
        && item.触发状态 !== 'consumed'
      )),
      ...normalizeTimeline(value, fingerprint),
    ]
    this.state.timelineGenerationFingerprint = fingerprint
  }

  commitRoundOutcome(input: {
    fingerprint: string
    timelineFingerprint: string
    selectedDirectionId?: string
    selectedEventId?: string
    hadDueWorldEvents: boolean
  }): void {
    if (input.selectedDirectionId) {
      this.state.lastSelectedDirectionId = input.selectedDirectionId
      this.state.directionHints = this.state.directionHints.filter((item) => (
        item.id !== input.selectedDirectionId || item.sourceFingerprint !== input.fingerprint
      ))
      if (activeSource(this.state.directionHints, input.fingerprint).length === 0) {
        this.state.directionPoolFingerprint = undefined
      }
    }
    if (input.selectedEventId) {
      this.state.lastSelectedEventId = input.selectedEventId
      this.state.eventCandidates = this.state.eventCandidates.filter((item) => (
        item.id !== input.selectedEventId || item.sourceFingerprint !== input.fingerprint
      ))
      if (activeSource(this.state.eventCandidates, input.fingerprint).length === 0) {
        this.state.eventPoolFingerprint = undefined
      }
    }
    if (input.hadDueWorldEvents) {
      for (const item of this.state.timelineCommitments) {
        if (
          item.sourceFingerprint === input.timelineFingerprint
          && item.触发状态 === 'due'
        ) item.触发状态 = 'consumed'
      }
      if (!this.state.timelineCommitments.some((item) => (
        item.sourceFingerprint === input.timelineFingerprint
        && item.触发状态 !== 'consumed'
        && item.触发状态 !== 'invalidated'
      ))) {
        this.state.timelineGenerationFingerprint = undefined
      }
    }
  }

  getView(
    currentAge: number,
    fingerprint: string,
    timelineSourceFingerprint = fingerprint,
    selectionKey = '',
  ): NarrativeControlPlaneView {
    for (const item of this.state.timelineCommitments) {
      if (
        item.sourceFingerprint === timelineSourceFingerprint
        && item.触发状态 === 'scheduled'
        && currentAge >= item.目标年龄
      ) item.触发状态 = 'due'
    }
    const directionPool = activeSource(this.state.directionHints, fingerprint)
    const eventPool = activeSource(this.state.eventCandidates, fingerprint)
    return {
      ...(this.state.birthProfile ? { birthProfile: structuredClone(this.state.birthProfile) } : {}),
      ...(this.state.lifePlan ? { lifePlan: structuredClone(this.state.lifePlan) } : {}),
      directionHints: structuredClone(selectOne(directionPool, selectionKey)),
      eventCandidates: structuredClone(selectOne(eventPool, selectionKey)),
      dueWorldEvents: structuredClone(this.state.timelineCommitments.filter((item) => (
        item.sourceFingerprint === timelineSourceFingerprint && item.触发状态 === 'due'
      ))),
    }
  }
}
