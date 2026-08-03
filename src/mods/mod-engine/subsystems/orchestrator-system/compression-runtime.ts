/**
 * Purpose: Execute the mandatory narrative compression gate and publish its memory-index results.
 * Owner: mod-engine
 * Responsibility: Own compression scheduling, retries, commits, diagnostics, and L1-L3 index updates.
 */

import { eventBus } from '@/core'
import type { YearEvent } from '@/foundation'
import type { OrchestratorSystem } from '../orchestrator-system'
import {
  USE_AI_SUMMARY_COMPRESSION,
  memoryLifecycle,
  runCompressionGate,
  summaryCompressor,
  useEngineStore,
  digestLedger,
} from '../../orchestrator-shared'
import { projectSummaryToNarrativeTimeline } from '../../helpers/timeline-memory'

export function buildYearEventsRuntime(
  orchestrator: OrchestratorSystem,
): YearEvent[] {
  const fallbackRound = orchestrator['state'].round
  const fallbackAge = orchestrator['computeNarrativeAge'](orchestrator['buildRoundContext']())
  const fallbackTimeLabel = `${fallbackRound.eraName}${fallbackRound.eraYear}年`
  const ledgerByRound = new Map(
    digestLedger.getEntries().map((entry) => [entry.round, entry]),
  )
  const firstRound = Math.max(
    1,
    orchestrator['state'].totalRounds - orchestrator['state'].narrativeHistory.length + 1,
  )

  return orchestrator['state'].narrativeHistory.map((n, i) => {
    const round = firstRound + i
    const ledgerEntry = ledgerByRound.get(round)
    const age = n.displayAge ?? fallbackAge
    const timeLabel = n.displayTimeLabel?.trim() || fallbackTimeLabel

    return {
      id: round,
      contextId: n.contextId ?? orchestrator['worldSetting']?.contextId,
      totalDays: n.totalDays,
      age,
      totalMonths: Math.max(0, Math.round(age * 12)),
      eraYear: fallbackRound.eraYear,
      eraName: '',
      narrative: n.text,
      digest: ledgerEntry?.digest || undefined,
      importance: ledgerEntry?.importance,
      keyEvents: ledgerEntry?.events.length
        ? ledgerEntry.events.map((event) => ({
            text: event.text,
            importance: event.adjustedImportance,
            ...(event.entities && event.entities.length > 0
              ? { entities: event.entities }
              : {}),
          }))
        : undefined,
      timeLabel,
      ...(n.isBranchPoint
        ? {
            isBranchPoint: true,
            branchTitle: n.branchTitle,
            branchOptions: n.branchOptions,
          }
        : {}),
      ...(n.resolvedChoice
        ? {
            resolvedChoice: n.resolvedChoice,
            resolvedChoiceRound: n.resolvedChoiceRound,
          }
        : {}),
    }
  })
}

/** Phase 6：L1-L3 AI 压缩唯一闸门 + 记忆生命周期索引。 */

export function runCompressionPipelineRuntime(
  orchestrator: OrchestratorSystem,
): Promise<void> {
  if (!USE_AI_SUMMARY_COMPRESSION) {
    orchestrator['setCompressionDiagnostic']({ status: 'skipped', reason: 'disabled' })
    return Promise.resolve()
  }
  if (orchestrator['isPreviewExecution']()) return Promise.resolve()
  if (!orchestrator['lastAiConfig'] || !orchestrator['worldSetting'] || !orchestrator['characterState']) {
    const error = new Error('压缩闸门缺少 AI、世界或角色上下文')
    orchestrator['setCompressionDiagnostic']({ status: 'failed', reason: 'missing-context' })
    return Promise.reject(error)
  }
  if (orchestrator['pendingCompression']) {
    return orchestrator['pendingCompression']
  }
  const compressionStartedAt = Date.now()
  orchestrator['setCompressionDiagnostic']({ status: 'pending', startedAt: compressionStartedAt })

  const decision = memoryLifecycle.decideCompression()
  const turnCount = orchestrator['state'].totalRounds - 1
  const events = orchestrator['buildYearEvents']()
  const due = summaryCompressor.needsCompression(events, turnCount)
  const existingL1Keys = new Set(
    summaryCompressor.getSummaries().summaries
      .filter((summary) => summary.level === 1)
      .map((summary) => `${summary.startRound}:${summary.endRound}`),
  )
  const existingSummaryKeys = new Set(
    summaryCompressor.getSummaries().summaries.map(
      (summary) => `${summary.level}:${summary.startRound}:${summary.endRound}`,
    ),
  )

  const aiConfig = orchestrator['lastAiConfig']
  const worldSetting = orchestrator['worldSetting']
  const characterState = orchestrator['characterState']
  const lifeRunId = orchestrator['state'].lifeRunId
  const task = runCompressionGate({
    due,
    attempt: ({ signal }) => summaryCompressor.createCompressionCandidate(
      aiConfig,
      events,
      worldSetting,
      characterState,
      turnCount,
      undefined,
      orchestrator['lastSessionId'],
      memoryLifecycle,
      lifeRunId,
      signal,
    ),
  })
    .then(async (gateResult) => {
      if (gateResult.status === 'not-due') {
        await summaryCompressor.commitCompressionCandidate({
          newCompressedSummaries: summaryCompressor.getSummaries(),
          newLatestSummary: '',
          shouldShowSummary: false,
          didCompress: false,
          completedRounds: turnCount + 1,
          stats: summaryCompressor.getStats(),
        }, lifeRunId)
        orchestrator['setCompressionDiagnostic']({
          status: 'completed',
          reason: 'not-due',
          attemptsStarted: 0,
          retryAttemptsStarted: 0,
          durationMs: Math.max(0, Date.now() - compressionStartedAt),
        })
        orchestrator['compressionGateFailure'] = null
        return
      }
      if (!gateResult.result) throw new Error('压缩闸门成功但缺少候选结果')

      await summaryCompressor.commitCompressionCandidate(gateResult.result, lifeRunId)
      orchestrator['state'].compressedSummaries = gateResult.result.newCompressedSummaries
      const stats = gateResult.result.stats
      orchestrator['state'].compressionStats = {
        l1Count: stats.totalL1,
        l2Count: stats.totalL2,
        l3Count: stats.totalL3,
        lastAt: stats.lastCompressionAt,
      }
      useEngineStore.getState().setCompressedSummaries(gateResult.result.newCompressedSummaries)
      useEngineStore.getState().setCompressionStats(orchestrator['state'].compressionStats)

      const compressedSummaries = gateResult.result.newCompressedSummaries
      let maxIndexedEndRound = 0
      if (compressedSummaries?.summaries) {
        const newSummaries = compressedSummaries.summaries
          .filter((summary) => summary.level === 1
            ? !existingL1Keys.has(`${summary.startRound}:${summary.endRound}`)
            : !existingSummaryKeys.has(
                `${summary.level}:${summary.startRound}:${summary.endRound}`,
              ))
          .sort((a, b) => a.level - b.level)

        for (const summary of newSummaries) {
          if (summary.level === 1) {
            memoryLifecycle.addToIndex(
              1,
              summary.startRound,
              summary.endRound,
              summary.content,
              projectSummaryToNarrativeTimeline(summary, orchestrator['state'].totalRounds),
              memoryLifecycle.getTaggedEvents().filter(
                (e) => e.round >= summary.startRound && e.round <= summary.endRound,
              ),
            )
            maxIndexedEndRound = Math.max(maxIndexedEndRound, summary.endRound)
          } else {
            memoryLifecycle.addCompressedSummaryToIndex(
              summary.level,
              summary.startRound,
              summary.endRound,
              summary.content,
              projectSummaryToNarrativeTimeline(summary, orchestrator['state'].totalRounds),
            )
          }
        }
      }

      if (maxIndexedEndRound > 0) {
        const clearedEvents = memoryLifecycle.clearTaggedEventsThrough(maxIndexedEndRound)
        eventBus.emit('mod-engine:narrative-compressed', {
          level: 'L1',
          reason: decision.shouldCompress ? decision.reason : 'interval',
          clearedEvents,
          stats: orchestrator['state'].compressionStats,
        })
      }
      orchestrator['setCompressionDiagnostic']({
        status: 'completed',
        durationMs: Math.max(0, Date.now() - compressionStartedAt),
        attemptsStarted: gateResult.attemptsStarted,
        retryAttemptsStarted: gateResult.retryAttemptsStarted,
        l1Count: orchestrator['state'].compressionStats.l1Count,
        l2Count: orchestrator['state'].compressionStats.l2Count,
        l3Count: orchestrator['state'].compressionStats.l3Count,
      })
      orchestrator['compressionGateFailure'] = null
    })
    .catch((err) => {
      console.error('[Orchestrator] 叙事压缩失败:', err)
      orchestrator['setCompressionDiagnostic']({
        status: 'failed',
        durationMs: Math.max(0, Date.now() - compressionStartedAt),
        error: err instanceof Error ? err.message : String(err),
      })
      orchestrator['compressionGateFailure'] = err instanceof Error ? err : new Error(String(err))
      throw err
    })
    .finally(() => {
      if (orchestrator['pendingCompression'] === task) {
        orchestrator['pendingCompression'] = null
      }
    })
  orchestrator['pendingCompression'] = task
  return task
}

export async function ensureCompressionGateRuntime(
  orchestrator: OrchestratorSystem,
): Promise<void> {
  await orchestrator['runCompressionPipeline']()
}
