/**
 * Purpose: Project morality labels, transition-audit defaults, and sampled life records.
 * Owner: mod-pages/game-over
 * Responsibility: Pure game-over record projection only; scoring and page state remain elsewhere.
 */

import type { NarrativeTransitionAuditSnapshot } from '@/foundation'

const MORALITY_LABELS: Record<string, string> = {
  supremeGood: '至善',
  greatGood: '大善',
  good: '善良',
  balanced: '中庸',
  evilLeaning: '偏恶',
  greatEvil: '大恶',
  supremeEvil: '极恶',
}

interface LifeRecordSource {
  text: string
  displayTimeLabel?: string
  displayAge?: number
}

export interface LifeRecord {
  id: string
  stage: string
  timeLabel: string
  ageLabel: string
  text: string
}

export function formatMorality(level: string): string {
  return MORALITY_LABELS[level] ?? '中庸'
}

export function missingTransitionAudit(
  round: number,
  narrativeId: string,
): NarrativeTransitionAuditSnapshot {
  return {
    schemaVersion: 1,
    round,
    narrativeId,
    validatedWritePath: false,
    interceptorPassed: false,
    intentValidationPassed: false,
    historicalCommitPassed: false,
    structuredDataPresent: false,
    structuredDataAccepted: false,
    requestedChangeCount: 0,
    committedChangeCount: 0,
    rejectedChangeCount: 0,
    trusted: false,
    validationClean: false,
    reasons: ['missing-transition-audit'],
  }
}

export function selectLifeRecords(history: LifeRecordSource[]): LifeRecord[] {
  if (history.length === 0) return []
  const lastIndex = history.length - 1
  const indexes = Array.from(new Set([0, Math.floor(lastIndex / 2), lastIndex]))
  return indexes.map((index) => {
    const entry = history[index]!
    const stage = history.length === 1
      ? '人生记录'
      : index === 0 ? '早期记录' : index === lastIndex ? '最终记录' : '中期记录'
    return {
      id: `${index}-${entry.displayTimeLabel ?? ''}-${entry.displayAge ?? ''}`,
      stage,
      timeLabel: entry.displayTimeLabel ?? `第 ${index + 1} 轮`,
      ageLabel: entry.displayAge === undefined ? '' : `${entry.displayAge} 岁`,
      text: entry.text,
    }
  })
}
