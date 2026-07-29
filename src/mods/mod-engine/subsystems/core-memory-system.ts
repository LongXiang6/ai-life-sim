/**
 * @module core-memory-system.ts
 * @description 核心记忆系统 —— 管理关键关系事实与玩家原创事实投影
 * @mod mod-engine
 *
 * NPC 互动继续作为当前关系网络投影；玩家原创内容按真实时间与年龄进入
 * 统一故事时间轴。内部事实不通过权重标签或独立原创保护字段发送给故事 AI。
 */

import type { SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { BaseSubsystem } from '@/core'
import { useEngineStore } from '../store'
import type { CharacterCreation } from '../types'
import { AI_CREATION_CATEGORIES } from '../helpers/narrative-ai-protocol'
import type { NarrativeTimelineEntry } from '../helpers/timeline-memory'
import type { NarrativeRelationshipUpdate } from '../helpers/narrative-semantic-signals'
import {
  isNarrativeRecordVisible,
  type NarrativeMemoryScope,
  type NarrativeScopeView,
} from '../helpers/narrative-context-scope'

// ============================================================
// 类型定义
// ============================================================

/** NPC 互动记录 */
export interface NPCInteractionRecord {
  npcName: string
  npcEntityId?: string
  contextId?: string
  memoryScope?: NarrativeMemoryScope
  round: number
  type: 'first_meeting' | 'conflict' | 'alliance' | 'betrayal' | 'marriage' | 'death' | 'other'
  summary: string
  /** 促成该互动事实的历史事件账本条目。 */
  historicalEventIds?: string[]
}

function normalizeHistoricalEventIds(ids?: readonly string[]): string[] {
  return [...new Set((ids ?? []).map((id) => id.trim()).filter(Boolean))]
}

/** 互动类型标签映射 */
const INTERACTION_LABELS: Record<string, string> = {
  first_meeting: '初次相遇',
  conflict: '冲突',
  alliance: '结盟',
  betrayal: '背叛',
  marriage: '婚约',
  death: '离世',
  other: '重要互动',
}

export interface CoreMemoryRoundTime {
  displayTimeLabel?: string
  displayAge?: number
  totalDays?: number
}

// ============================================================
// CoreMemorySystem
// ============================================================

export class CoreMemorySystem extends BaseSubsystem {
  readonly id = 'core-memory' as const
  readonly mod = 'mod-engine' as const
  readonly label = '核心记忆管理' as const
  readonly description = '管理不应遗忘的关键事件、伏笔上下文和NPC关系网，保障叙事连贯性' as const

  /** NPC 关系网：name → 互动记录列表 */
  private npcMap = new Map<string, NPCInteractionRecord[]>()

  // === ISubSystem 接口实现 ===

  /** 每轮恢复并暴露已由结构化语义写入的 NPC 关系。 */
  collectState(_context: RoundContext): SubSystemState {
    // 存档恢复：首次调用时从持久化 store 中恢复 NPC 关系网
    if (this.npcMap.size === 0) {
      this.restoreFromStore()
    }

    return {
      id: this.id,
      summary: `核心记忆：${this.npcMap.size}个关键人物`,
      data: structuredClone({}),
    }
  }

  /** 不接受外部变更 */
  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    if (!changes || typeof changes !== 'object') {
      throw new Error(`[${this.id}] Invalid changes`);
    }
    if (changes.id !== this.id) {
      throw new Error(`[${this.id}] Changes ID mismatch`);
    }
    if (!changes.changes || typeof changes.changes !== 'object') {
      throw new Error(`[${this.id}] Invalid changes.changes`);
    }
    if (!changes.description || changes.description.trim() === '') {
      throw new Error(`[${this.id}] Missing changes.description`);
    }
    // 核心记忆由系统自行管理
  }

  /** 重置 */
  reset(): void {
    this.npcMap.clear()
    // 同步清空持久化 store
    useEngineStore.getState().setCoreMemoryNpcMap({})
  }

  // === 公共方法 ===

  /** 获取 NPC 关系网（供 F3 可视化等消费方使用） */
  getNpcMap(): Map<string, NPCInteractionRecord[]> {
    return this.npcMap
  }

  /** 读档/硬刷新后显式从 EngineStore 恢复，避免依赖未注册的 collectState 调用。 */
  hydrateFromStore(): void {
    this.npcMap.clear()
    this.restoreFromStore()
  }

  /** 预生成会消费未来关系更新并写入 Store；结束后必须同时恢复单例与 Store。 */
  capturePreviewState(): unknown {
    return structuredClone([...this.npcMap.entries()])
  }

  restorePreviewState(snapshot: unknown): void {
    if (!Array.isArray(snapshot)) return
    this.npcMap.clear()
    for (const entry of snapshot) {
      if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') continue
      if (!Array.isArray(entry[1])) continue
      this.npcMap.set(entry[0], structuredClone(entry[1]) as NPCInteractionRecord[])
    }
    this.syncToStore()
  }

  /** 获取受保护 NPC 名称列表（供 memoryForgetting 娱乐性护栏使用） */
  getProtectedNpcNames(): string[] {
    return [...this.npcMap.keys()]
  }

  /** 由主叙事 AI 的结构化 relationshipUpdates 更新关系网。 */
  recordRelationshipUpdates(
    updates: NarrativeRelationshipUpdate[],
    round: number,
    contextId?: string,
    historicalEventIds?: readonly string[],
  ): void {
    const normalizedHistoricalEventIds = normalizeHistoricalEventIds(historicalEventIds)
    for (const update of updates) {
      const npcName = update.name.trim()
      if (!npcName) continue
      const records = this.npcMap.get(npcName) ?? []
      const duplicate = records.find((record) =>
        record.round === round
        && record.contextId === contextId
        && record.type === update.type
        && record.summary === update.summary,
      )
      if (duplicate) {
        const mergedHistoricalEventIds = normalizeHistoricalEventIds([
          ...(duplicate.historicalEventIds ?? []),
          ...normalizedHistoricalEventIds,
        ])
        duplicate.historicalEventIds = mergedHistoricalEventIds.length > 0
          ? mergedHistoricalEventIds
          : undefined
        continue
      }
      records.push({
        npcName,
        contextId,
        memoryScope: contextId ? 'context' : 'global',
        round,
        type: update.type,
        summary: update.summary,
        historicalEventIds: normalizedHistoricalEventIds.length > 0
          ? [...normalizedHistoricalEventIds]
          : undefined,
      })
      this.npcMap.set(npcName, records)
    }
    this.syncToStore()
  }

  /** 将玩家角色的原创事实投影到统一时间轴，不发送内部权重标签。 */
  buildCreationTimelineEntries(
    characterCreations: readonly CharacterCreation[] = [],
    resolveRoundTime?: (round: number) => CoreMemoryRoundTime | undefined,
  ): NarrativeTimelineEntry[] {
    return characterCreations.map((creation) => {
      const time = resolveRoundTime?.(creation.confirmedRound)
      const roundLabel = `第${creation.confirmedRound}轮`
      const occurrenceParts = [
        time?.displayTimeLabel ?? roundLabel,
        time?.displayAge === undefined ? undefined : `角色${time.displayAge}岁`,
      ].filter((part): part is string => Boolean(part))
      const category = AI_CREATION_CATEGORIES.internalToAI[creation.category] ?? '其他'
      return {
        timeSpan: time?.displayTimeLabel ?? roundLabel,
        occurrenceTime: occurrenceParts.join(' · '),
        text: `玩家角色亲自开创[玩家原创·${category}] ${creation.name}：${creation.description}`,
        sortRound: creation.confirmedRound,
        sortTotalDays: time?.totalDays,
      }
    })
  }

  /** 构建 NPC 关系网文本 */
  buildNPCNetworkText(view: NarrativeScopeView = {}): string {
    if (this.npcMap.size === 0) return ''

    const lines: string[] = ['【关键人物关系】']

    for (const [name, records] of this.npcMap) {
      const visibleRecords = records.filter((record) => isNarrativeRecordVisible(record, view))
      const first = visibleRecords[0]
      if (!first) continue
      const keyInteractions = visibleRecords.filter((r) => r.type !== 'first_meeting')

      lines.push(`\n▸ ${name}`)
      const firstLabel = INTERACTION_LABELS[first.type] ?? first.type
      lines.push(`  ${firstLabel}（第${first.round}轮${first.contextId ? `·上下文=${first.contextId}` : ''}）：${first.summary}`)

      for (const interaction of keyInteractions) {
        const typeLabel = INTERACTION_LABELS[interaction.type] ?? interaction.type
        lines.push(`  ${typeLabel}（第${interaction.round}轮${interaction.contextId ? `·上下文=${interaction.contextId}` : ''}）：${interaction.summary}`)
      }
    }

    return lines.length > 1 ? lines.join('\n') : ''
  }

  /** 将 npcMap 同步到持久化 store（每次叙事更新后调用） */
  private syncToStore(): void {
    const plain: Record<string, NPCInteractionRecord[]> = {}
    for (const [name, records] of this.npcMap) {
      plain[name] = records
    }
    useEngineStore.getState().setCoreMemoryNpcMap(plain)
  }

  /** 从持久化 store 恢复 npcMap（首次 collectState 时调用） */
  private restoreFromStore(): void {
    const stored = useEngineStore.getState().coreMemoryNpcMap
    if (!stored || Object.keys(stored).length === 0) return
    for (const [name, records] of Object.entries(stored)) {
      this.npcMap.set(name, records)
    }
  }
}

export const coreMemory = new CoreMemorySystem()
