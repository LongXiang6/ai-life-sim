/**
 * @module NPCMemorySystem
 * @description NPC 记忆子系统 —— 独立记忆链（关键词 + 重要性 + 时间衰减）
 * @mod mod-npc
 *
 * 记忆生命周期：
 *   1. 创建 → 分配 importance 等级
 *   2. 衰减 → 每年检查 memoryAge > RETENTION[imp] → importance 降一级
 *   3. 保留 → 固定年限只能降低 importance，不能删除剧情事实
 *   4. 摘要 → 同一年内多条 trivial 记忆可做全事实、可追踪的语义合并
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
  readonly description = '管理 NPC 独立记忆链：创建、重要性衰减、完整保留与可追踪语义合并' as const

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
      memories: [memory, ...npc.memories],
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

      updatedMemories.push({
        ...mem,
        importance: newImportance,
      })
    }

    return { ...npc, memories: updatedMemories }
  }

  /** 将同一年内的多条 trivial 记忆做全事实语义合并；不得只保留前/后 N 条。 */
  static compressTrivial(npcs: Record<string, NPCState>, npcId: string, currentYear: number): NPCState | null {
    const npc = npcs[npcId]
    if (!npc) return null

    const trivialMemories = npc.memories.filter(
      (m) => m.importance === 'trivial' && m.createdYear === currentYear,
    )

    if (trivialMemories.length < 3) return null

    const mergedRecords = trivialMemories.map((memory) => {
      const keywords = memory.keywords.length > 0 ? memory.keywords.join('、') : '无'
      const related = memory.relatedId ?? '无'
      return `[来源 ${memory.id}] 摘要：${memory.summary}；详情：${memory.detail}；关键词：${keywords}；关联：${related}；情绪值：${memory.emotionValence}`
    })
    const mergedContent = `本年完整记忆合并：${mergedRecords.join('\n')}`
    const mergedKeywords = [...new Set(trivialMemories.flatMap((m) => m.keywords))]
    const averageEmotion = trivialMemories.reduce((sum, memory) => sum + memory.emotionValence, 0)
      / trivialMemories.length

    const mergedMemory: NPCMemory = {
      id: `mem_${npcId}_compressed_${currentYear}`,
      keywords: mergedKeywords,
      summary: mergedContent,
      detail: mergedContent,
      importance: 'minor',
      createdYear: currentYear,
      emotionValence: clamp(averageEmotion, -10, 10),
      decayRate: 0.1,
    }

    const otherMemories = npc.memories.filter(
      (m) => m.importance !== 'trivial' || m.createdYear !== currentYear,
    )

    return {
      ...npc,
      memories: [mergedMemory, ...otherMemories],
    }
  }

  /** 获取 NPC 的全部重要记忆摘要（注入 Prompt） */
  static getRecentMemories(npc: NPCState): string {
    const important = npc.memories
      .filter((m) => m.importance !== 'trivial')
    if (important.length === 0) return '无近期重要记忆'
    return important.map((m) => `[${m.importance}] ${m.summary}`).join('\n')
  }
}
