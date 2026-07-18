/**
 * @module core-memory-system.ts
 * @description 核心记忆系统 —— 管理不应被遗忘的关键事件、伏笔上下文和 NPC 关系网
 * @mod mod-engine
 *
 * 设计理念：
 *   旧版 memoryLifecycle 的固定条数选取曾导致“均匀遗忘”——
 *   关键事件和琐碎事件被同等对待。本系统维护一组"永久记忆"：
 *   1. 关键事件摘要（HIGH 重要性条目，来自 searchIndex）
 *   2. NPC 关系网记忆（首次相遇 + 关键互动）
 *
 * 这些记忆不受 buildRichPrompt 的滚动窗口限制，在 Prompt 中分层注入。
 */

import type { SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { BaseSubsystem } from '@/core'
import { memoryLifecycle } from './memory-lifecycle-system'
import { summaryCompressor } from './summary-compressor-system'
import { useEngineStore } from '../store'
import type { NarrativeRelationshipUpdate } from '../helpers/narrative-semantic-signals'

// ============================================================
// 类型定义
// ============================================================

/** NPC 互动记录 */
export interface NPCInteractionRecord {
  npcName: string
  round: number
  type: 'first_meeting' | 'conflict' | 'alliance' | 'betrayal' | 'marriage' | 'death' | 'other'
  summary: string
}

/** 关键事件记忆条目 */
interface CoreMemoryEntry {
  rounds: string
  importance: 'HIGH'
  content: string
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

/** 关键事件摘要最大条目数 */
const MAX_CORE_EVENTS = 15

/** 完整保留的最近条目数（超出部分合并为摘要） */
const KEEP_RECENT_EVENTS = 12

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
  recordRelationshipUpdates(updates: NarrativeRelationshipUpdate[], round: number): void {
    for (const update of updates) {
      const npcName = update.name.trim()
      if (!npcName) continue
      const records = this.npcMap.get(npcName) ?? []
      const duplicate = records.some((record) =>
        record.round === round
        && record.type === update.type
        && record.summary === update.summary,
      )
      if (duplicate) continue
      records.push({
        npcName,
        round,
        type: update.type,
        summary: update.summary,
      })
      this.npcMap.set(npcName, records)
    }
    this.syncToStore()
  }

  /** 构建核心记忆文本（关键事件摘要） */
  buildCoreMemory(): string {
    const entries = this.collectHighImportanceEntries()
    if (entries.length === 0) return ''

    const lines: string[] = ['【关键事件记忆】以下事件对角色至关重要，请在叙事中保持一致性。']
    for (const entry of entries) {
      lines.push(`- [第${entry.rounds}轮] ${entry.content}`)
    }

    return lines.join('\n')
  }

  /** 构建 NPC 关系网文本 */
  buildNPCNetworkText(): string {
    if (this.npcMap.size === 0) return ''

    const lines: string[] = ['【关键人物关系】']

    for (const [name, records] of this.npcMap) {
      const first = records[0]
      if (!first) continue
      const keyInteractions = records.filter((r) => r.type !== 'first_meeting')

      lines.push(`\n▸ ${name}`)
      const firstLabel = INTERACTION_LABELS[first.type] ?? first.type
      lines.push(`  ${firstLabel}（第${first.round}轮）：${first.summary}`)

      for (const interaction of keyInteractions) {
        const typeLabel = INTERACTION_LABELS[interaction.type] ?? interaction.type
        lines.push(`  ${typeLabel}（第${interaction.round}轮）：${interaction.summary}`)
      }
    }

    return lines.join('\n')
  }

  // === 私有方法 ===

  /** 从 searchIndex 中收集所有 HIGH 重要性条目 */
  private collectHighImportanceEntries(): CoreMemoryEntry[] {
    const index = memoryLifecycle.getSearchIndex()
    if (index.length === 0) return []

    // 按 startRound 升序排列（最早事件在前）
    const sorted = index
      .filter((e) => e.maxImportance === 'HIGH')
      .sort((a, b) => a.startRound - b.startRound)

    if (sorted.length === 0) return []

    // 未超过上限：全部保留为完整条目
    if (sorted.length <= MAX_CORE_EVENTS) {
      return sorted.map((entry) => ({
        rounds: `${entry.startRound}-${entry.endRound}`,
        importance: 'HIGH' as const,
        content: entry.content,
      }))
    }

    // 超过上限：最近 KEEP_RECENT_EVENTS 条完整保留，其余合并为摘要
    const overflow = sorted.slice(0, sorted.length - KEEP_RECENT_EVENTS)
    const recent = sorted.slice(-KEEP_RECENT_EVENTS)

    // 用 summaryCompressor 的 AI 压缩摘要替代硬截断
    const overflowStart = overflow[0].startRound
    const overflowEnd = overflow[overflow.length - 1].endRound
    const mergedContent = this.buildMergedSummary(overflow)
    if (!mergedContent) {
      return sorted.map((entry) => ({
        rounds: `${entry.startRound}-${entry.endRound}`,
        importance: 'HIGH' as const,
        content: entry.content,
      }))
    }

    const mergedEntry: CoreMemoryEntry = {
      rounds: `${overflowStart}-${overflowEnd}`,
      importance: 'HIGH',
      content: mergedContent,
    }

    const recentEntries: CoreMemoryEntry[] = recent.map((entry) => ({
      rounds: `${entry.startRound}-${entry.endRound}`,
      importance: 'HIGH' as const,
      content: entry.content,
    }))

    return [mergedEntry, ...recentEntries]
  }

  /** 用已有 AI 压缩摘要构建合并文本（禁止硬截断） */
  private buildMergedSummary(
    entries: Array<{ startRound: number; endRound: number }>,
  ): string | null {
    if (entries.length === 0) return null
    const startRound = entries[0].startRound
    const endRound = entries[entries.length - 1].endRound
    const eventCount = entries.length
    const { summaries } = summaryCompressor.getSummaries()
    if (summaries.length === 0) {
      return null
    }

    // 筛选覆盖溢出区间的摘要：L2 优先（25轮跨度），L2 不足时 L3 兜底，均不足时 L1 兜底
    const relevant = summaries
      .filter((s) => {
        // 与 [startRound, endRound] 有交集
        return s.endRound >= startRound && s.startRound <= endRound
      })
      .sort((a, b) => {
        // 层级优先：低层级（更详细）在前
        if (a.level !== b.level) return a.level - b.level
        // 同层级按时间排列
        return a.startRound - b.startRound
      })

    if (relevant.length === 0) {
      // L2/L3 均不可用：尝试 L1 摘要兜底（每 5 轮生成，最早可用）
      const l1Summaries = summaries.filter((s) => s.level === 1)
      if (l1Summaries.length > 0) {
        // 使用所有覆盖溢出区间的 L1 摘要拼接
        const l1Relevant = l1Summaries
          .filter((s) => s.endRound >= startRound && s.startRound <= endRound)
          .sort((a, b) => a.startRound - b.startRound)
        if (l1Relevant.length > 0) {
          const lines = l1Relevant.map(
            (s) => `[L1·第${s.startRound}-${s.endRound}轮] ${s.content}`,
          )
          return `【早期关键事件合辑·${eventCount}条（L1摘要）】\n${lines.join('\n')}`
        }
      }
      return null
    }

    const fullyCovered = entries.every((entry) => relevant.some(
      (summary) => summary.startRound <= entry.startRound && summary.endRound >= entry.endRound,
    ))
    if (!fullyCovered) {
      return null
    }

    // 逐条拼接（每段已经是 AI 生成的完整段落，不做字符截断）
    const lines = relevant.map((s) => `[L${s.level}·${s.startRound}-${s.endRound}轮] ${s.content}`)
    return `【早期关键事件合辑·${eventCount}条】\n${lines.join('\n')}`
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
