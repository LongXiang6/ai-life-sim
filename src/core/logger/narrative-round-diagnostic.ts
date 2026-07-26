/**
 * @module narrative-round-diagnostic.ts
 * @description 叙事回合单次采用结果与本地开发诊断契约。
 *
 * 该契约只描述系统阶段结果，不描述点击、导航、输入或其他用户操作。
 */

import type { DevelopmentSystemEvent } from './development-system-diagnostic'

export interface NarrativeDiagnosticPhase {
  name: string
  status: 'completed' | 'failed' | 'skipped' | 'warning'
  durationMs: number
  details?: Record<string, unknown>
  error?: { name?: string; message: string; stack?: string }
}

export interface NarrativeRoundAdoption {
  responseReceived: boolean
  narrativeAdopted: boolean
  structuredDataPresent: boolean
  structuredDataAccepted: boolean
  requestedChangeCount: number
  committedChangeCount: number
  rejectedChangeCount: number
  rejectedReasons: string[]
  narrativeId?: string
  narrativeChars: number
}

export interface NarrativeRoundOutcomeReport {
  schemaVersion: 1
  lifeRunId: string
  round: number
  executionKind: 'real' | 'preview'
  status: 'completed' | 'failed'
  startedAt: number
  completedAt: number
  durationMs: number
  phases: NarrativeDiagnosticPhase[]
  adoption: NarrativeRoundAdoption
  quality?: Record<string, unknown>
  compression?: Record<string, unknown>
  autoSave?: Record<string, unknown>
  systemEvents?: DevelopmentSystemEvent[]
  error?: { name?: string; message: string; stack?: string }
}

/** 每个真实回合仅调用一次；代理日志仍是完整 AI 交换的唯一来源。 */
export async function postNarrativeRoundOutcome(
  report: NarrativeRoundOutcomeReport,
): Promise<boolean> {
  if (typeof window === 'undefined') return false
  try {
    const response = await fetch('/api/narrative/round-outcome', {
      method: 'POST',
      credentials: 'same-origin',
      cache: 'no-store',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
      keepalive: true,
    })
    return response.ok
  } catch {
    return false
  }
}
