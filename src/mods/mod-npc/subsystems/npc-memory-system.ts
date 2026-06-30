/**
 * @module NPCMemorySystem
 * @description NPC 记忆子系统 —— 独立记忆链（关键词 + 重要性 + 时间衰减）
 * @mod mod-npc
 *
 * 记忆生命周期：
 *   1. 创建 → 分配 importance 等级
 *   2. 衰减 → 每年检查 memoryAge > RETENTION[imp] → importance 降一级
 *   3. 遗忘 → trivial 记忆超期后删除
 *   4. 摘要 → 同一年内多条 trivial 记忆合并为一条 minor
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import type { NPCMemory, MemoryImportance, NPCState } from '../types'
import { MEMORY_RETENTION } from '../types'
import { clamp } from '@/core/shared'

/** 重要性降级顺序 */
const IMPORTANCE_DEGRADE: MemoryImportance[] = ['critical', 'major', 'notable', 'minor', 'trivial']

export class NPCMemorySystem implements ISubSystem {
  readonly id = 'npc-memory' as const
  readonly mod = 'mod-npc' as const
  readonly label = 'NPC 记忆系统' as const
  readonly description = '管理 NPC 独立记忆链：创建、衰减、遗忘、摘要合并' as const

  collectState(_context: RoundContext): SubSystemState {
    return {
      id: this.id,
      summary: '【NPC 记忆】由 NPC 行为系统驱动',
      data: structuredClone({}),
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    if (!changes || typeof changes !== 'object') return
    if (changes.id !== this.id) return
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) return

    // 记忆变更由外部调用公共方法处理
  }

  reset(): void {
    // 无内部状态，由 Store 管理
  }

  // ============================================================
  // 公共方法
  // ============================================================

  /** 为 NPC 创建一条新记忆 */
  static addMemory(
    npc: NPCState,
    summary: string,
    detail: string,
    importance: MemoryImportance,
    keywords: string[],
    relatedId?: string,
    emotionValence: number = 0,
    currentYear: number = 1,
  ): NPCState {
    const memory: NPCMemory = {
      id: `mem_${npc.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      keywords,
      summary,
      detail,
      importance,
      createdYear: currentYear,
      relatedId,
      emotionValence: clamp(emotionValence, -10, 10),
      decayRate: 0.1,
    }

    return {
      ...npc,
      memories: [memory, ...npc.memories].slice(0, 200),
    }
  }

  /** 衰减 NPC 记忆（每过一个时间步长调用） */
  static decayMemories(npc: NPCState, currentYear: number): NPCState {
    const updatedMemories: NPCMemory[] = []
    for (const mem of npc.memories) {
      const memoryAge = currentYear - mem.createdYear
      const retention = MEMORY_RETENTION[mem.importance]
      const currentIdx = IMPORTANCE_DEGRADE.indexOf(mem.importance)

      // 检查是否需要降级
      let newImportance = mem.importance
      if (memoryAge > retention && currentIdx < IMPORTANCE_DEGRADE.length - 1) {
        newImportance = IMPORTANCE_DEGRADE[currentIdx + 1]
      }

      // trivial 记忆超期 2 倍后删除
      if (newImportance === 'trivial' && memoryAge > MEMORY_RETENTION.trivial * 2) {
        continue
      }

      updatedMemories.push({
        ...mem,
        importance: newImportance,
      })
    }

    return { ...npc, memories: updatedMemories }
  }

  /** 压缩同一年内的多条 trivial 记忆 */
  static compressTrivial(npcs: Record<string, NPCState>, npcId: string, currentYear: number): NPCState | null {
    const npc = npcs[npcId]
    if (!npc) return null

    const trivialMemories = npc.memories.filter(
      (m) => m.importance === 'trivial' && m.createdYear === currentYear,
    )

    if (trivialMemories.length < 3) return null

    // 保留最新 2 条，其余合并为一条 minor
    const toKeep = trivialMemories.slice(0, 2)
    const toMerge = trivialMemories.slice(2)
    const mergedSummary = toMerge.map((m) => m.summary).join('；')
    const mergedKeywords = [...new Set(toMerge.flatMap((m) => m.keywords))].slice(0, 5)

    const mergedMemory: NPCMemory = {
      id: `mem_${npcId}_compressed_${currentYear}`,
      keywords: mergedKeywords,
      summary: `本年内发生多件事：${mergedSummary}`,
      detail: mergedSummary,
      importance: 'minor',
      createdYear: currentYear,
      emotionValence: 0,
      decayRate: 0.1,
    }

    const otherMemories = npc.memories.filter(
      (m) => m.importance !== 'trivial' || m.createdYear !== currentYear,
    )

    return {
      ...npc,
      memories: [...toKeep, mergedMemory, ...otherMemories].slice(0, 200),
    }
  }

  /** 获取 NPC 的近期记忆摘要（注入 Prompt） */
  static getRecentMemories(npc: NPCState, limit: number = 5): string {
    const important = npc.memories
      .filter((m) => m.importance !== 'trivial')
      .slice(0, limit)
    if (important.length === 0) return '无近期重要记忆'
    return important.map((m) => `[${m.importance}] ${m.summary}`).join('\n')
  }
}
