/**
 * @module core-memory-system.ts
 * @description 核心记忆系统 —— 管理不应被遗忘的关键事件、伏笔上下文和 NPC 关系网
 * @mod mod-engine
 *
 * 设计理念：
 *   memoryLifecycle 的均匀截断策略（L1×2 + L2×1）导致"均匀遗忘"——
 *   关键事件和琐碎事件被同等对待。本系统维护一组"永久记忆"：
 *   1. 关键事件摘要（HIGH 重要性条目，来自 searchIndex）
 *   2. NPC 关系网记忆（首次相遇 + 关键互动）
 *
 * 这些记忆不受 buildRichPrompt 的滚动窗口限制，在 Prompt 中分层注入。
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { getRoundSequence } from '@/foundation'
import { memoryLifecycle } from './memory-lifecycle-system'
import { summaryCompressor } from './summary-compressor-system'
import { patternManager } from '../patterns'
import { useEngineStore } from '../store'

// ============================================================
// 特性开关
// ============================================================

/** 是否使用统一模式管理层（默认关闭，确保向后兼容） */
let USE_PATTERN_MANAGER = false

/**
 * 启用统一模式管理器
 */
export function enablePatternManager(): void {
  USE_PATTERN_MANAGER = true
}

/**
 * 禁用统一模式管理器
 */
export function disablePatternManager(): void {
  USE_PATTERN_MANAGER = false
}

/**
 * 获取模式管理器启用状态
 * @returns 是否启用统一模式管理器
 */
export function isPatternManagerEnabled(): boolean {
  return USE_PATTERN_MANAGER
}

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

/** 互动分类关键词 */
const INTERACTION_KEYWORDS: Array<{ type: string; keywords: string[] }> = [
  { type: 'conflict', keywords: ['战斗', '对抗', '冲突', '敌对', '决裂', '仇', '杀'] },
  { type: 'alliance', keywords: ['结盟', '合作', '联手', '同盟', '约定', '协议'] },
  { type: 'betrayal', keywords: ['背叛', '出卖', '背弃', '叛变', '反水'] },
  { type: 'marriage', keywords: ['娶', '嫁', '成婚', '结婚', '道侣', '夫妻'] },
  { type: 'death', keywords: ['死', '去世', '陨落', '阵亡', '牺牲'] },
]

/** 每 NPC 最多保留互动数 */
const MAX_INTERACTIONS_PER_NPC = 5

/** 总 NPC 上限 */
const MAX_NPC_COUNT = 20

/** 关键事件摘要最大条目数 */
const MAX_CORE_EVENTS = 15

/** 完整保留的最近条目数（超出部分合并为摘要） */
const KEEP_RECENT_EVENTS = 12

// ============================================================
// CoreMemorySystem
// ============================================================

export class CoreMemorySystem implements ISubSystem {
  readonly id = 'core-memory' as const
  readonly mod = 'mod-engine' as const
  readonly label = '核心记忆管理' as const
  readonly description = '管理不应遗忘的关键事件、伏笔上下文和NPC关系网，保障叙事连贯性' as const

  /** NPC 关系网：name → 互动记录列表 */
  private npcMap = new Map<string, NPCInteractionRecord[]>()

  /** 上一轮处理过的回合（防重复） */
  private lastProcessedRound = -1

  // === ISubSystem 接口实现 ===

  /** 每轮收集后分析叙事，提取 NPC 关系 */
  collectState(context: RoundContext): SubSystemState {
    const currentRound = getRoundSequence(context)

    // 存档恢复：首次调用时从持久化 store 中恢复 NPC 关系网
    if (this.npcMap.size === 0) {
      this.restoreFromStore()
    }

    const lastNarrative = this.extractLastNarrative(context)

    if (lastNarrative && currentRound !== this.lastProcessedRound) {
      this.onNarrativeGenerated(lastNarrative, currentRound)
      this.lastProcessedRound = currentRound
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
    this.lastProcessedRound = -1
    // 同步清空持久化 store
    useEngineStore.getState().setCoreMemoryNpcMap({})
  }

  // === 公共方法 ===

  /** 获取 NPC 关系网（供 F3 可视化等消费方使用） */
  getNpcMap(): Map<string, NPCInteractionRecord[]> {
    return this.npcMap
  }

  /** 获取受保护 NPC 名称列表（供 memoryForgetting 娱乐性护栏使用） */
  getProtectedNpcNames(): string[] {
    return [...this.npcMap.keys()]
  }

  /** 叙事生成后调用：提取 NPC 关系更新关系网 */
  onNarrativeGenerated(narrative: string, round: number): void {
    const relationships = patternManager.extractRelationships(narrative)

    for (const rel of relationships) {
      const confidence = (rel as Record<string, unknown>).confidence as number | undefined
      if (confidence !== undefined && confidence < 0.6) continue

      const data = (rel as Record<string, unknown>)
      const npcName = data.name as string | undefined
      if (!npcName || npcName.trim().length === 0) continue

      const records = this.npcMap.get(npcName) || []

      // 首次相遇：总是记录
      if (records.length === 0) {
        records.push({
          npcName,
          round,
          type: 'first_meeting',
          summary: this.buildRelationshipSummary(rel),
        })
        this.enforceNPCLimit()
        this.npcMap.set(npcName, records)
        continue
      }

      // 关键互动：分类并记录
      const classification = this.classifyInteraction(rel)
      if (classification) {
        records.push({
          npcName,
          round,
          type: classification as typeof records[number]['type'],
          summary: this.buildRelationshipSummary(rel),
        })
        // 每 NPC 最多 5 条：保留第一条（相遇）+ 最近 4 条
        if (records.length > MAX_INTERACTIONS_PER_NPC) {
          const first = records[0]
          const recent = records.slice(-(MAX_INTERACTIONS_PER_NPC - 1))
          this.npcMap.set(npcName, [first, ...recent])
        } else {
          this.npcMap.set(npcName, records)
        }
      }
    }

    // 每次更新后同步到持久化 store
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
    let count = 0

    for (const [name, records] of this.npcMap) {
      if (count >= MAX_NPC_COUNT) break

      const first = records[0]
      const keyInteractions = records.filter((r) => r.type !== 'first_meeting')

      lines.push(`\n▸ ${name}`)
      lines.push(`  初次相遇（第${first.round}轮）：${first.summary}`)

      for (const interaction of keyInteractions) {
        const typeLabel = INTERACTION_LABELS[interaction.type] ?? interaction.type
        lines.push(`  ${typeLabel}（第${interaction.round}轮）：${interaction.summary}`)
      }

      count++
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
    const mergedContent = this.buildMergedSummary(overflowStart, overflowEnd, overflow.length)

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
  private buildMergedSummary(startRound: number, endRound: number, eventCount: number): string {
    const { summaries } = summaryCompressor.getSummaries()
    if (summaries.length === 0) {
      return `早期共${eventCount}个关键事件（摘要不可用）`
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
      return `早期共${eventCount}个关键事件（无覆盖摘要）`
    }

    // 逐条拼接（每段已经是 AI 生成的完整段落，不做字符截断）
    const lines = relevant.map((s) => `[L${s.level}·${s.startRound}-${s.endRound}轮] ${s.content}`)
    return `【早期关键事件合辑·${eventCount}条】\n${lines.join('\n')}`
  }

  /** 从 RoundContext 提取最新叙事文本 */
  private extractLastNarrative(context: RoundContext): string | undefined {
    const orchState = context.subsystemStates['orchestrator']?.data as Record<string, unknown> | undefined
    return orchState?.lastNarrative as string | undefined
  }

  /** 构建关系摘要（不超过 80 字） */
  private buildRelationshipSummary(rel: unknown): string {
    const data = rel as Record<string, unknown>
    const action = data.action as string | undefined
    const type = data.type as string | undefined
    const name = data.name as string | undefined

    const parts: string[] = []
    if (action) parts.push(action)
    if (type) parts.push(type)
    if (name) parts.push(`与${name}`)

    return parts.join('') || '未记录'
  }

  /** 判断互动是否属于关键类型 */
  private classifyInteraction(rel: unknown): string | null {
    const data = rel as Record<string, unknown>
    const desc = (data.description as string) || (data.summary as string) || ''
    const extractedType = data.type as string | undefined

    // 先检查关系类型字段
    if (extractedType === 'spouse') return 'marriage'
    if (extractedType === 'enemy') return 'conflict'

    // 再按关键词分类
    for (const { type, keywords } of INTERACTION_KEYWORDS) {
      for (const kw of keywords) {
        if (desc.includes(kw)) return type
      }
    }

    return null // 非关键互动，不记录
  }

  /** 强制 NPC 数量上限（移除最久未更新的） */
  private enforceNPCLimit(): void {
    if (this.npcMap.size <= MAX_NPC_COUNT) return

    // 按最后互动轮次排序，移除最早的
    const entries = [...this.npcMap.entries()]
      .sort((a, b) => {
        const aLast = a[1][a[1].length - 1]?.round ?? 0
        const bLast = b[1][b[1].length - 1]?.round ?? 0
        return aLast - bLast
      })

    // 移除最早的，保留 MAX_NPC_COUNT 个
    const toRemove = entries.slice(0, entries.length - MAX_NPC_COUNT)
    for (const [name] of toRemove) {
      this.npcMap.delete(name)
    }
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
