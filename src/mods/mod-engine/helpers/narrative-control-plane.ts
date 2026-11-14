/**
 * Purpose: Own conditional narrative planning state and trigger decisions.
 * Owner: mod-engine
 * Responsibility: Persist reusable abstract event cards; never promote cards into facts.
 */

import type {
  NarrativeBirthProfile,
  NarrativeControlPlaneView,
  NarrativeEventCard,
  NarrativeLifePlan,
  NarrativeWorldTimelineCommitment,
  DifficultyLevel,
} from '@/foundation'
import {
  DIFFICULTY_NARRATIVE_GUIDANCE,
  FATE_DRAMATIC_BIASES,
  FATE_DRAMATIC_BIAS_LABELS,
} from '@/foundation'
import {
  baseFingerprint,
  birthFingerprint,
  timelineFingerprint,
  type NarrativeControlTriggerInput,
} from './narrative-control-plane-input'
import {
  normalizeBirthProfile,
  normalizeEventCards,
  normalizeLifePlan,
  normalizeTimeline,
} from './narrative-control-plane-normalizers'

export type NarrativeControlCallKind = 'birth' | 'plan' | 'event' | 'timeline'

const NARRATIVE_CONTROL_PLANE_SCHEMA_VERSION = 3 as const

/** 卡池可用性：只看来源指纹。卡片不做年龄或阶段门槛，任何一轮都能全部投影给主故事。 */
function isCardAvailableFor(card: NarrativeEventCard, fingerprint: string): boolean {
  return card.sourceFingerprint === fingerprint
}

export interface NarrativeControlPlanePersistenceState {
  schemaVersion: typeof NARRATIVE_CONTROL_PLANE_SCHEMA_VERSION
  birthProfile?: NarrativeBirthProfile
  lifePlan?: NarrativeLifePlan
  eventCards: NarrativeEventCard[]
  timelineCommitments: NarrativeWorldTimelineCommitment[]
  eventPoolFingerprint?: string
  timelineGenerationFingerprint?: string
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

export class NarrativeControlPlane {
  private state: NarrativeControlPlanePersistenceState = {
    schemaVersion: NARRATIVE_CONTROL_PLANE_SCHEMA_VERSION,
    eventCards: [],
    timelineCommitments: [],
  }
  private currentFingerprint?: string

  reset(): void {
    this.state = {
      schemaVersion: NARRATIVE_CONTROL_PLANE_SCHEMA_VERSION,
      eventCards: [],
      timelineCommitments: [],
    }
    this.currentFingerprint = undefined
  }

  capturePersistenceState(): NarrativeControlPlanePersistenceState {
    return structuredClone(this.state)
  }

  getBirthProfile(): NarrativeBirthProfile | undefined {
    return this.state.birthProfile ? structuredClone(this.state.birthProfile) : undefined
  }

  restorePersistenceState(snapshot: unknown): void {
    this.currentFingerprint = undefined
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
      this.reset()
      return
    }
    const source = snapshot as Partial<NarrativeControlPlanePersistenceState>
    if (source.schemaVersion !== NARRATIVE_CONTROL_PLANE_SCHEMA_VERSION) {
      this.reset()
      return
    }
    const rawEventCards = Array.isArray(source.eventCards)
      ? structuredClone(source.eventCards)
      : []
    const eventCardGroups = new Map<string, unknown[]>()
    for (const card of rawEventCards) {
      if (!card || typeof card !== 'object' || Array.isArray(card)) continue
      const sourceFingerprint = text(card.sourceFingerprint)
      if (!sourceFingerprint) continue
      const group = eventCardGroups.get(sourceFingerprint) ?? []
      group.push(card)
      eventCardGroups.set(sourceFingerprint, group)
    }
    const eventCards = [...eventCardGroups].flatMap(([fingerprint, cards]) => (
      normalizeEventCards(cards, fingerprint)
    ))
    const timelineCommitments = Array.isArray(source.timelineCommitments)
      ? structuredClone(source.timelineCommitments)
      : []
    const eventPoolFingerprint = text(source.eventPoolFingerprint)
      || eventCards[0]?.sourceFingerprint
    const timelineGenerationFingerprint = text(source.timelineGenerationFingerprint)
      || timelineCommitments.find((item) => (
        item.触发状态 !== 'consumed' && item.触发状态 !== 'invalidated'
      ))?.sourceFingerprint
    this.state = {
      schemaVersion: NARRATIVE_CONTROL_PLANE_SCHEMA_VERSION,
      ...(source.birthProfile ? { birthProfile: structuredClone(source.birthProfile) } : {}),
      ...(source.lifePlan ? { lifePlan: structuredClone(source.lifePlan) } : {}),
      eventCards,
      timelineCommitments,
      ...(eventPoolFingerprint ? { eventPoolFingerprint } : {}),
      ...(timelineGenerationFingerprint ? { timelineGenerationFingerprint } : {}),
    }
  }

  inspect(input: NarrativeControlTriggerInput): NarrativeControlPreparation {
    const fingerprint = baseFingerprint(input)
    this.currentFingerprint = fingerprint
    const birthSourceFingerprint = birthFingerprint(input)
    const timelineSource = timelineFingerprint(input)
    const currentAge = Number(
      (input.subsystemStates['character-base']?.data as Record<string, unknown> | undefined)
        ?.status
      && (((input.subsystemStates['character-base']?.data as Record<string, unknown>).status as Record<string, unknown>).ageDays),
    )
    const ageYears = Number.isFinite(currentAge) ? Math.max(0, Math.floor(currentAge / 365)) : 0
    const difficulty = input.context.difficulty ?? 'normal'
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
    // 事件池不依赖人生规划：首轮即可与 plan/timeline 并行生成，首屏就有卡。
    // 只在原始池为空或池指纹不匹配时补池；有待消费批次时抑制补池，
    // 否则排队轮主故事看到的卡名在新池里映射不到 id。
    const rawPool = activeSource(this.state.eventCards, fingerprint)
    if (
      !input.suppressEventRefill
      && (this.state.eventPoolFingerprint !== fingerprint || rawPool.length === 0)
    ) {
      triggers.push({
        kind: 'event',
        fingerprint,
        reason: this.state.eventPoolFingerprint !== fingerprint
          ? '当前阶段没有可适用的事件卡池'
          : '事件卡池已用尽',
      })
    }
    if (this.state.timelineGenerationFingerprint !== timelineSource) {
      triggers.push({ kind: 'timeline', fingerprint: timelineSource, reason: '当前世界缺少有效的未来承诺' })
    }

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
      view: this.getView(
        ageYears,
        fingerprint,
        timelineSource,
        Number(input.context.roundSequence ?? 0),
        difficulty,
      ),
    }
  }

  commitBirth(value: unknown, fingerprint: string, startingAge = 0): void {
    this.state.birthProfile = normalizeBirthProfile(value, fingerprint, startingAge)
  }

  commitPlan(value: unknown, fingerprint: string): void {
    this.state.lifePlan = normalizeLifePlan(value, fingerprint)
    this.state.eventCards = []
    this.state.eventPoolFingerprint = undefined
  }

  commitEvents(value: unknown, fingerprint: string): boolean {
    if (this.currentFingerprint !== fingerprint) return false
    this.state.eventCards = normalizeEventCards(value, fingerprint)
    this.state.eventPoolFingerprint = fingerprint
    return true
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
    selectedEventIds?: string[]
    hadDueWorldEvents: boolean
  }): void {
    const selectedEventIds = [...new Set(input.selectedEventIds ?? [])].filter(Boolean)
    if (selectedEventIds.length > 0) {
      const selectedEventIdSet = new Set(selectedEventIds)
      this.state.eventCards = this.state.eventCards.filter((item) => (
        !selectedEventIdSet.has(item.id) || item.sourceFingerprint !== input.fingerprint
      ))
      // 池被用空不再清指纹：「需要重生成」的唯一判断归 inspect 的剩余可用卡为 0。
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
    roundSequence = 0,
    difficulty: DifficultyLevel = 'normal',
  ): NarrativeControlPlaneView {
    for (const item of this.state.timelineCommitments) {
      if (
        item.sourceFingerprint === timelineSourceFingerprint
        && item.触发状态 === 'scheduled'
        && currentAge >= item.目标年龄
      ) item.触发状态 = 'due'
    }
    // 整池交给主故事：只按指纹筛选并按 id 码点稳定排序，不抽固定张数、不做年龄门槛。
    const eventCards = this.state.eventCards
      .filter((card) => isCardAvailableFor(card, fingerprint))
      .sort((left, right) => (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
      .map((card) => structuredClone(card))

    // 计算第四维：命运转折调性
    let biasHash = 2166136261
    const biasSeed = `${roundSequence}|${currentAge}|${fingerprint}`
    for (let i = 0; i < biasSeed.length; i += 1) {
      biasHash ^= biasSeed.charCodeAt(i)
      biasHash = Math.imul(biasHash, 16777619)
    }
    const selectedBias = FATE_DRAMATIC_BIASES[Math.abs(biasHash) % FATE_DRAMATIC_BIASES.length]!

    return {
      difficulty,
      difficultyGuidance: DIFFICULTY_NARRATIVE_GUIDANCE[difficulty],
      ...(this.state.birthProfile ? { birthProfile: structuredClone(this.state.birthProfile) } : {}),
      ...(this.state.lifePlan ? { lifePlan: structuredClone(this.state.lifePlan) } : {}),
      eventCards,
      dramaticBias: selectedBias,
      dramaticBiasLabel: FATE_DRAMATIC_BIAS_LABELS[selectedBias],
      dueWorldEvents: structuredClone(this.state.timelineCommitments.filter((item) => (
        item.sourceFingerprint === timelineSourceFingerprint && item.触发状态 === 'due'
      ))),
    }
  }
}
