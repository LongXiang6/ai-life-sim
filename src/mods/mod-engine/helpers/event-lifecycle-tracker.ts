/**
 * Purpose: Track a small set of high-signal events derived from active runtime owners.
 * Owner: mod-engine / narrative event lifecycle.
 * Responsibility: Prompt notices only; business state remains in the owning subsystem.
 */

export interface SystemEventNotice {
  eventType: string
  severity: number
  dataChange: string
  statusDesc: string
}

export interface EventLifecycleRecord {
  eventType: string
  firstSeenRound: number
  lastSeenRound: number
  consecutiveRounds: number
  peakSeverity: number
  peakDataChange: string
  status: 'new' | 'ongoing' | 'ending'
}

export type EventLifecycleTracker = Record<string, EventLifecycleRecord>

export interface DetectionStates {
  characterStatus?: {
    endRisk?: number
    health?: { vitality?: number; maxVitality?: number; alive?: boolean }
  }
  cultureTechState?: {
    activeEvents?: string[]
    activeTrends?: Array<{ name?: string; intensity?: number; remainingBasePoints?: number; remainingDays?: number }>
  }
  combatPowerState?: {
    rankLabel?: string
    subStage?: number
    progress?: number
  }
}

function detectRawEvents(states: DetectionStates): SystemEventNotice[] {
  const events: SystemEventNotice[] = []
  const character = states.characterStatus
  const health = character?.health
  if (health?.alive !== false) {
    const vitalityRatio = (health?.vitality ?? 100) / Math.max(1, health?.maxVitality ?? 100)
    if (vitalityRatio < 0.2) {
      events.push({
        eventType: '生命垂危',
        severity: 0.8,
        dataChange: `生命 ${health?.vitality ?? 0}/${health?.maxVitality ?? 100}`,
        statusDesc: '角色当前伤势或生命状态已经直接影响行动能力',
      })
    }
    if ((character?.endRisk ?? 0) >= 80) {
      events.push({
        eventType: '人生终局临近',
        severity: 0.7,
        dataChange: `终局风险 ${Math.round(character?.endRisk ?? 0)}%`,
        statusDesc: '角色接近叙事寿命上限，可以出现合理的衰老、告别或人生收束',
      })
    }
  }

  const culture = states.cultureTechState
  const cultureChanges = [
    ...(culture?.activeEvents ?? []),
    ...(culture?.activeTrends ?? [])
      .filter((trend) => (trend.intensity ?? 0) >= 70 && (trend.remainingBasePoints ?? trend.remainingDays ?? 0) > 0)
      .map((trend) => trend.name ?? '')
      .filter(Boolean),
  ]
  if (cultureChanges.length > 0) {
    events.push({
      eventType: '知识文化变化',
      severity: 0.4,
      dataChange: [...new Set(cultureChanges)].join('、'),
      statusDesc: '已经成立的知识突破或文化趋势正在影响当前生活背景',
    })
  }

  const combat = states.combatPowerState
  if (combat?.subStage === 5 && (combat.progress ?? 0) >= 9000) {
    events.push({
      eventType: '力量突破关口',
      severity: 0.5,
      dataChange: `${combat.rankLabel ?? '当前阶位'}进度 ${Math.round(combat.progress ?? 0)}`,
      statusDesc: '角色已接近当前力量阶位的突破条件，仍需由已发生剧情提供契机',
    })
  }

  return events.sort((left, right) => right.severity - left.severity || left.eventType.localeCompare(right.eventType))
}

export function buildEventInjectionText(
  states: DetectionStates,
  lastLifecycle: EventLifecycleTracker = {},
  currentRound = 0,
): { eventInjectionText: string; newLifecycle: EventLifecycleTracker } {
  const rawEvents = detectRawEvents(states)
  const activeTypes = new Set(rawEvents.map((event) => event.eventType))
  const newLifecycle: EventLifecycleTracker = {}
  const injectedLines: string[] = []

  for (const event of rawEvents) {
    const existing = lastLifecycle[event.eventType]
    const record: EventLifecycleRecord = existing
      ? {
          eventType: event.eventType,
          firstSeenRound: existing.firstSeenRound,
          lastSeenRound: currentRound,
          consecutiveRounds: existing.consecutiveRounds + 1,
          peakSeverity: Math.max(existing.peakSeverity, event.severity),
          peakDataChange: event.severity >= existing.peakSeverity ? event.dataChange : existing.peakDataChange,
          status: 'ongoing',
        }
      : {
          eventType: event.eventType,
          firstSeenRound: currentRound,
          lastSeenRound: currentRound,
          consecutiveRounds: 1,
          peakSeverity: event.severity,
          peakDataChange: event.dataChange,
          status: 'new',
        }
    newLifecycle[event.eventType] = record
    const lifecycleLabel = record.status === 'new' ? '新发生' : `持续第${record.consecutiveRounds}轮`
    injectedLines.push(`  ${event.eventType}(${lifecycleLabel}·${event.severity.toFixed(1)}) | ${event.dataChange} | ${event.statusDesc}`)
  }

  for (const [eventType, previous] of Object.entries(lastLifecycle)) {
    if (activeTypes.has(eventType)) continue
    if (previous.status === 'ending') {
      if (currentRound - previous.lastSeenRound >= 5) continue
      newLifecycle[eventType] = previous
      injectedLines.push(`  ${eventType}(已结束) | ${previous.peakDataChange} | 事件影响逐渐消退`)
      continue
    }
    const ending = { ...previous, status: 'ending' as const, lastSeenRound: currentRound }
    newLifecycle[eventType] = ending
    injectedLines.push(`  ${eventType}(已结束) | 此前${previous.peakDataChange} | 当前状态已脱离触发条件`)
  }

  if (injectedLines.length === 0) return { eventInjectionText: '', newLifecycle }
  return {
    eventInjectionText: ['【本轮系统事件】', ...injectedLines].join('\n'),
    newLifecycle,
  }
}
