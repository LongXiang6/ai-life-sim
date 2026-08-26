/**
 * Purpose: Define causal-delay records, scheduling contracts, labels, defaults, and deterministic fingerprints.
 * Owner: mod-engine
 * Responsibility: Causal data contracts and constants only; lifecycle state and commits stay in CausalDelaySystem.
 */

export type CausalEventType = 'kindness' | 'grudge' | 'promise' | 'debt'
export type CausalSeverity = 'minor' | 'normal' | 'major' | 'critical'
export type CausalEventScope = 'global' | 'context' | 'travel'
export type CausalSchedule = 'canonical-points' | 'legacy-round'
export type LegacyCausalSchedule = CausalSchedule | 'canonical-days'

export interface CausalEventRegistration {
  scope: CausalEventScope
  contextId?: string
  createdBasePoints?: number
  /** @deprecated 仅用于旧存档/调用边界迁移。 */
  createdTotalDays?: number
  originEventId?: string
  originNarrativeId?: string
}

export interface CausalTriggerCheckOptions {
  currentBasePoints?: number
  /** @deprecated 仅用于旧调用边界迁移。 */
  currentTotalDays?: number
  scope?: CausalEventScope
  contextId?: string
}

export interface CausalTriggerCommitOptions {
  currentBasePoints?: number
  /** @deprecated 仅用于旧调用边界迁移。 */
  currentTotalDays?: number
  resolutionEventId?: string
}

export interface CausalEvent {
  id: string
  legacyId?: string
  scope: CausalEventScope
  contextId?: string
  type: CausalEventType
  severity: CausalSeverity
  round: number
  age: number
  description: string
  relatedPerson?: string
  relatedFaction?: string
  schedule: LegacyCausalSchedule
  createdBasePoints?: number
  dueBasePoints?: number
  triggeredBasePoints?: number
  /** @deprecated 派生日历快照/旧存档迁移字段。 */
  createdTotalDays?: number
  /** @deprecated 派生日历快照/旧存档迁移字段。 */
  dueTotalDays?: number
  triggerDelay?: number
  originEventId?: string
  originNarrativeId?: string
  fingerprint: string
  deliveryState: 'pending' | 'presented' | 'pending-recognition' | 'continuing' | 'resolved'
  presentedNarrativeId?: string
  presentedRound?: number
  triggered: boolean
  triggeredRound?: number
  /** @deprecated 派生日历快照/旧存档迁移字段。 */
  triggeredTotalDays?: number
  resolutionEventId?: string
  triggerResult?: string
}

export interface CausalTriggerResult {
  hasTriggered: boolean
  triggeredEvents: CausalEvent[]
  narrativeText: string
}

export interface CausalConfig {
  delayBasePointsBySeverity: Record<CausalSeverity, number>
  /** @deprecated 派生日历快照；设置时会迁移到 delayBasePointsBySeverity。 */
  delayDaysBySeverity: Record<CausalSeverity, number>
}

export interface CausalDispositionInput {
  causalId: string
  status: 'resolved' | 'continuing' | 'not-touched'
  reason: string
  continuationDelayBasePoints?: number
  /** @deprecated 仅用于旧协议边界迁移。 */
  continuationDelayDays?: number
  resolutionEventId?: string
}

export const DEFAULT_CAUSAL_CONFIG: CausalConfig = {
  delayBasePointsBySeverity: {
    minor: 82,
    normal: 247,
    major: 493,
    critical: 1000,
  },
  delayDaysBySeverity: {
    minor: 30,
    normal: 90,
    major: 180,
    critical: 365,
  },
}

export const LEGACY_COMPAT_TRIGGER_DELAY_ROUNDS: Record<CausalSeverity, number> = {
  minor: 5,
  normal: 10,
  major: 15,
  critical: 25,
}

export const CAUSAL_DELAY_SNAPSHOT_SCHEMA_VERSION = 3 as const

export interface CausalDelaySnapshotV2 {
  schemaVersion: typeof CAUSAL_DELAY_SNAPSHOT_SCHEMA_VERSION
  config: CausalConfig
  causalEvents: CausalEvent[]
  stats: {
    totalRecorded: number
    totalTriggered: number
    pendingEvents: number
    lastTriggerAt: number
  }
  idSequence: number
}

export const CAUSAL_TYPE_DESCRIPTIONS: Record<CausalEventType, string> = {
  kindness: '恩情',
  grudge: '仇恨',
  promise: '承诺',
  debt: '债务',
}

export const CAUSAL_SEVERITY_DESCRIPTIONS: Record<CausalSeverity, string> = {
  minor: '轻微',
  normal: '普通',
  major: '重大',
  critical: '关键',
}

function normalizeFingerprintText(value: string | undefined): string {
  return value?.trim().replace(/\s+/gu, ' ').toLocaleLowerCase() ?? ''
}

export function buildCausalEventFingerprint(input: {
  type: CausalEventType
  scope: CausalEventScope
  contextId?: string
  description: string
  relatedPerson?: string
  relatedFaction?: string
  originEventId?: string
  originNarrativeId?: string
}): string {
  return JSON.stringify({
    type: input.type,
    scope: input.scope,
    contextId: normalizeFingerprintText(input.contextId),
    relatedPerson: normalizeFingerprintText(input.relatedPerson),
    relatedFaction: normalizeFingerprintText(input.relatedFaction),
    establishedFact: normalizeFingerprintText(input.description),
    originEventId: normalizeFingerprintText(input.originEventId),
    originNarrativeId: normalizeFingerprintText(input.originNarrativeId),
  })
}
