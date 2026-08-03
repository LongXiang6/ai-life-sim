/**
 * Purpose: Resolve narrative memory scope and refresh on-demand timeline recall from the save database.
 * Owner: mod-engine
 * Responsibility: Retrieve scoped memory hits without assembling the final prompt projection.
 */

import type { OrchestratorSystem } from '../orchestrator-system'
import { useWorldStore } from '@/mods/mod-world/world-runtime-api'
import { digestLedger, summaryCompressor } from '../../orchestrator-shared'
import type { NarrativeScopeView } from '../../helpers/narrative-context-scope'

export function getNarrativeScopeViewRuntime(
  orchestrator: OrchestratorSystem,
): NarrativeScopeView {
  const worldState = useWorldStore.getState()
  const closedContextIds = new Set(
    Object.values(worldState.contexts)
      .filter((instance) => (
        instance.scope.scope === 'closed' || instance.record.lifecycle === 'closed'
      ))
      .map((instance) => instance.record.id),
  )
  return {
    currentContextId: orchestrator['worldSetting']?.contextId,
    closedContextIds,
  }
}

/**
 * 在组装主叙事 Prompt 前检索本存档的明文时间轴记忆。
 * 查询词来自上一轮 AI 已提交的事件实体；数据库仍由压缩系统拥有。
 */

export async function refreshNarrativeMemoryRecallRuntime(
  orchestrator: OrchestratorSystem,
): Promise<void> {
  const entries = digestLedger.getEntries().slice(-8)
  const terms = [...new Set(entries.flatMap((entry) => entry.events.flatMap((event) => [
    ...(event.entities ?? []),
    event.text,
  ]).map((term) => term.trim()).filter((term) => term.length >= 2)))]
  if (terms.length === 0) {
    orchestrator['narrativeMemoryRecall'] = []
    orchestrator['recordSystemDiagnostic']('narrative-memory', 'recall-skipped', 'skipped', {
      reason: 'no-search-terms',
    })
    return
  }
  try {
    const hits = await summaryCompressor.searchMemory(
      orchestrator['state'].lifeRunId,
      orchestrator['state'].totalRounds,
      terms,
    )
    orchestrator['narrativeMemoryRecall'] = hits
      .filter((hit) => hit.active)
      .map((hit) => ({
        timeSpan: hit.timeSpan,
        occurrenceTime: hit.occurrenceTime,
        text: hit.text,
        sortRound: hit.sourceRounds.length > 0
          ? Math.min(...hit.sourceRounds)
          : orchestrator['state'].totalRounds,
      }))
    orchestrator['recordSystemDiagnostic']('narrative-memory', 'recall-completed', 'ok', {
      searchTermCount: terms.length,
      hitCount: hits.length,
    })
  } catch (error) {
    orchestrator['narrativeMemoryRecall'] = []
    orchestrator['recordSystemDiagnostic']('narrative-memory', 'recall-failed', 'error', {
      searchTermCount: terms.length,
    }, error)
    if (process.env.NODE_ENV === 'development') {
      console.warn('[Orchestrator] 时间轴记忆检索失败:', error)
    }
  }
}

/** 组装主叙事唯一的时间轴记忆投影。 */
