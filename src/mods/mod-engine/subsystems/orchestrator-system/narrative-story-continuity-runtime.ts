/**
 * Purpose: Prepare and commit future events extracted by the 02 story-continuity call.
 * Owner: mod-engine
 * Responsibility: Translate 02 future-event strings into the existing historical-event ledger only.
 */

import type {
  HistoricalEventCandidateInput,
  HistoricalEventPreparedAppend,
  HistoricalEventPreflightResult,
  ISubSystem,
  PendingCharacterDeath,
} from '@/foundation'
import type { NarrativeAIStoryContinuityData } from '../../helpers/narrative-ai-protocol'
import type { OrchestratorSystem } from '../orchestrator-system'
import type {
  PreparedNarrativeStoryContinuityLedger,
  StoryContinuitySourceTime,
} from './narrative-story-continuity-contracts'

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const
const SEASON_START_MONTH: Readonly<Record<string, number>> = {
  春: 3,
  夏: 6,
  秋: 9,
  冬: 12,
}

function emptyAppend(batchId: string): HistoricalEventPreparedAppend {
  return {
    batchId,
    events: [],
    transitions: [],
    evidence: [],
    causalEdges: [],
    candidateAudits: [],
    migrationMetadata: [],
  }
}

function mergeAppend(
  target: HistoricalEventPreparedAppend,
  source: HistoricalEventPreparedAppend | undefined,
): void {
  if (!source) return
  target.events.push(...structuredClone(source.events))
  target.transitions.push(...structuredClone(source.transitions))
  target.evidence.push(...structuredClone(source.evidence))
  target.causalEdges.push(...structuredClone(source.causalEdges))
  target.candidateAudits.push(...structuredClone(source.candidateAudits))
  target.migrationMetadata.push(...structuredClone(source.migrationMetadata))
}

function getPendingDeath(
  orchestrator: OrchestratorSystem,
  characterId: string,
): PendingCharacterDeath | undefined {
  const runtime = orchestrator['subsystems'].find((item) => item.id === 'character-base') as (ISubSystem & {
    getPendingDeath?: (entityId: string) => PendingCharacterDeath | undefined
  }) | undefined
  return runtime?.getPendingDeath?.(characterId)
}

function parseCalendarPoint(label: string): { year: number; month: number; day: number } | undefined {
  const year = Number(label.match(/(-?\d+)年/u)?.[1])
  if (!Number.isFinite(year)) return undefined
  const explicitMonth = Number(label.match(/(\d{1,2})月/u)?.[1])
  const season = label.match(/([春夏秋冬])季?/u)?.[1]
  const month = Number.isInteger(explicitMonth) && explicitMonth >= 1 && explicitMonth <= 12
    ? explicitMonth
    : season ? SEASON_START_MONTH[season] : 1
  const explicitDay = Number(label.match(/(\d{1,2})日/u)?.[1])
  const day = Number.isInteger(explicitDay) && explicitDay >= 1 && explicitDay <= DAYS_IN_MONTH[month - 1]
    ? explicitDay
    : 1
  return { year, month, day }
}

function dayOfYear(point: { month: number; day: number }): number {
  return DAYS_IN_MONTH.slice(0, point.month - 1).reduce((sum, days) => sum + days, 0) + point.day
}

function buildFutureSchedule(
  timeLabel: string,
  sourceTime: StoryContinuitySourceTime,
): HistoricalEventCandidateInput['schedule'] {
  const target = parseCalendarPoint(timeLabel)
  const current = parseCalendarPoint(sourceTime.label)
  if (!target || !current || sourceTime.totalDays === null) {
    if (!target) throw new Error(`未来事件缺少可识别的绝对时间：${timeLabel}`)
    return { conditionLabel: timeLabel }
  }
  const delta = (target.year - current.year) * 365 + dayOfYear(target) - dayOfYear(current)
  if (!Number.isSafeInteger(delta) || delta <= 0) {
    throw new Error(`未来事件时间不晚于来源回合终点：${timeLabel}`)
  }
  return {
    dueTotalDays: sourceTime.totalDays + delta,
    conditionLabel: timeLabel,
  }
}

function buildFutureCandidates(
  events: readonly string[],
  contextId: string,
  sourceTime: StoryContinuitySourceTime,
): HistoricalEventCandidateInput[] {
  const candidates: HistoricalEventCandidateInput[] = []
  for (const event of events) {
    const separator = event.indexOf('：')
    if (separator <= 0 || separator >= event.length - 1) continue
    const timeLabel = event.slice(0, separator).trim()
    const fact = event.slice(separator + 1).trim()
    if (!timeLabel || !fact) continue
    try {
      candidates.push({
        eventType: '未来事件',
        title: fact.slice(0, 80),
        description: fact,
        scope: { kind: 'context', contextIds: [contextId] },
        participants: [],
        locations: [],
        schedule: buildFutureSchedule(timeLabel, sourceTime),
        triggerConditionLabel: timeLabel,
        requiredCapabilities: [],
        tags: ['故事连续性'],
      })
    } catch {
      // 单条未来事项无法换算时放弃该条，其他可用事项继续登记。
    }
  }
  return candidates
}

export function prepareNarrativeStoryContinuityLedgerRuntime(
  orchestrator: OrchestratorSystem,
  narrativeId: string,
  result: NarrativeAIStoryContinuityData,
  sourceTime: StoryContinuitySourceTime,
): PreparedNarrativeStoryContinuityLedger {
  const accepted = orchestrator['getPreparedNarrativeRecord'](narrativeId)
  const ledger = orchestrator['getHistoricalEventLedgerRuntime']()
  if (!ledger) throw new Error('historical-event-ledger 未注册或公开契约不完整')
  const prepared = emptyAppend(`narrative-story-continuity:${accepted.narrativeId}`)
  const candidates = buildFutureCandidates(
    result.未来事件,
    accepted.roundContext.contextId,
    sourceTime,
  )
  if (candidates.length > 0) {
    const submission = ledger.prepareCandidateSubmission({
      source: {
        kind: 'narrative',
        sourceId: `narrative-story-continuity:${accepted.narrativeId}`,
        description: '故事连续性提取登记正文已经明确安排的未来事项。',
      },
      candidates,
    }, accepted.roundContext)
    if (submission.candidateAudits.length !== candidates.length) {
      throw new Error('未来事件未能完整形成历史事件账本准备包')
    }
    mergeAppend(prepared, submission.prepared)
  }
  return {
    narrativeId: accepted.narrativeId,
    roundContext: structuredClone(accepted.roundContext),
    basePrepared: structuredClone(prepared),
  }
}

export function captureNarrativeStoryContinuityLedgerTransactionRuntime(
  orchestrator: OrchestratorSystem,
): unknown {
  const ledger = orchestrator['getHistoricalEventLedgerRuntime']()
  if (!ledger) throw new Error('historical-event-ledger 未注册或公开契约不完整')
  return ledger.capturePersistenceState()
}

export function restoreNarrativeStoryContinuityLedgerTransactionRuntime(
  orchestrator: OrchestratorSystem,
  snapshot: unknown,
): void {
  const ledger = orchestrator['getHistoricalEventLedgerRuntime']()
  if (!ledger) throw new Error('historical-event-ledger 未注册或公开契约不完整')
  ledger.restorePersistenceState(snapshot)
}

export function commitPreparedNarrativeStoryContinuityLedgerRuntime(
  orchestrator: OrchestratorSystem,
  narrativeId: string,
  preparation: PreparedNarrativeStoryContinuityLedger,
): string[] {
  const accepted = orchestrator['getPreparedNarrativeRecord'](narrativeId)
  const ledger = orchestrator['getHistoricalEventLedgerRuntime']()
  if (!ledger) throw new Error('historical-event-ledger 未注册或公开契约不完整')
  if (
    preparation.narrativeId !== accepted.narrativeId
    || preparation.roundContext.contextId !== accepted.roundContext.contextId
    || preparation.roundContext.roundSequence !== accepted.roundContext.roundSequence
    || preparation.roundContext.totalDays !== accepted.roundContext.totalDays
  ) {
    throw new Error('故事连续性账本准备包不属于当前冻结回合')
  }

  const prepared = structuredClone(preparation.basePrepared)
  const pendingDeath = getPendingDeath(orchestrator, accepted.roundContext.characterId)
  let deathEventIds: string[] = []
  if (pendingDeath) {
    const deathPlan = orchestrator['buildHistoricalDeathTransactionPlan'](
      pendingDeath,
      accepted.roundContext,
      accepted.narrativeId,
    )
    const deathPreflight = ledger.preflightBatch(deathPlan.batch, accepted.roundContext)
    if (!deathPreflight.ok || !deathPreflight.prepared) {
      throw new Error(deathPreflight.errors.join('；') || '角色死亡历史事实预检失败')
    }
    deathEventIds = [deathPlan.eventId]
    mergeAppend(prepared, deathPreflight.prepared)
  }

  const preflight: HistoricalEventPreflightResult = { ok: true, errors: [], prepared }
  const commit = ledger.commitPrepared(preflight)
  if (!commit.ok) throw new Error(commit.errors.join('；') || '故事连续性账本提交失败')
  if (deathEventIds.length > 0) {
    orchestrator['notifyHistoricalEventsCommitted'](commit.eventIds, accepted.roundContext)
  }
  return commit.eventIds
}
