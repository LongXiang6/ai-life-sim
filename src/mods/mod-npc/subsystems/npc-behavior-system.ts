/**
 * @module NPCBehaviorSystem
 * @description NPC 行为子系统 —— 行为决策（交易/战斗/社交/移动）
 * @mod mod-npc
 *
 * 行为决策流程：
 *   1. 本地规则推演（权重计算 → 行为选择）—— 主要路径
 *   2. AI 增强（关键 NPC + 重要事件）—— 仅在 isKeyNPC=true 时触发
 *
 * 行为权重计算因素：
 *   - NPC 性格（aggression, sociability, greed）
 *   - 关系网络（与目标的好感度）
 *   - 当前环境（是否在战斗区域、资源丰富度等）
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import type {
  NPCState,
  NPCBehaviorType,
  NPCBehaviorRecord,
  NPCRelation,
} from '../types'
import { ANTAGONIST_TAG_LABELS } from '../types'
import { useNPCStore } from '../store'
import { clamp } from '@/core/shared'

/** 行为权重配置 */
interface BehaviorWeights {
  idle: number
  trade: number
  combat: number
  social: number
  move: number
  train: number
  work: number
}

/** 默认权重（每种行为的基础概率） */
const BASE_WEIGHTS: BehaviorWeights = {
  idle: 20,
  trade: 10,
  combat: 5,
  social: 15,
  move: 10,
  train: 15,
  work: 25,
}

export class NPCBehaviorSystem implements ISubSystem {
  readonly id = 'npc-behavior' as const
  readonly mod = 'mod-npc' as const
  readonly label = 'NPC 行为系统' as const
  readonly description = 'NPC 行为决策：本地规则推演（主）+ AI 增强（关键 NPC 重要事件）' as const

  collectState(context: RoundContext): SubSystemState {
    const antagonistSummary = this.buildAntagonistSummary(context.characterId)
    return structuredClone({
      id: this.id,
      summary: antagonistSummary || '【NPC 行为】无活跃反派',
      data: {},
    })
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    if (!changes || typeof changes !== 'object') return
    if (changes.id !== this.id) return
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) return
    // 行为变更由 advance 方法处理
  }

  reset(): void {
    // 无内部状态，由 Store 管理
  }

  // ============================================================
  // 公共方法
  // ============================================================

  /**
   * 本地规则推演：为单个 NPC 决定本回合行为
   * @returns 行为类型 + 叙事文本
   */
  static decideBehavior(npc: NPCState, currentYear: number): { type: NPCBehaviorType; narrative: string } {
    const weights = { ...BASE_WEIGHTS }

    // 性格修正
    weights.combat += npc.attributes.aggression / 5
    weights.social += npc.attributes.sociability / 5
    weights.trade += npc.attributes.greed / 5

    // 状态修正：有敌人关系 → 增加战斗概率
    const hasEnemy = npc.relations.some((r) => r.type === 'enemy')
    if (hasEnemy) weights.combat += 15

    // 反派修正：反派标签 → 大幅增加战斗概率
    if (npc.antagonist?.isAntagonist) {
      weights.combat += npc.antagonist.threatLevel / 5   // 最高 +20
      weights.idle = clamp(weights.idle - 10, 0, Infinity)      // 减少闲置
      // 根据冲突阶段调整
      if (npc.antagonist.conflictPhase === '决战中') {
        weights.combat += 20
        weights.idle = 0
      }
    }

    // 如果最近 3 次行为都是同一种 → 降低该行为权重
    const recent = npc.recentBehaviors.slice(0, 3)
    if (recent.length >= 3 && recent.every((b) => b.type === recent[0]!.type)) {
      const repeatType = recent[0]!.type
      weights[repeatType] = clamp(weights[repeatType] - 20, 0, Infinity)
    }

    // 投掷随机行为
    const type = NPCBehaviorSystem._weightedRandom(weights)

    // 生成叙事文本
    const narrative = NPCBehaviorSystem._generateNarrative(npc, type, currentYear)

    return { type, narrative }
  }

  /**
   * 创建行为记录
   */
  static createBehaviorRecord(
    npcId: string,
    type: NPCBehaviorType,
    narrative: string,
    year: number,
    targetId?: string,
  ): NPCBehaviorRecord {
    return {
      id: `beh_${npcId}_${Date.now()}_${Math.random().toString(36).slice(2, 4)}`,
      type,
      description: narrative,
      targetId,
      year,
      result: '已执行',
    }
  }

  /**
   * 处理社交行为引发的关系变化
   */
  static processSocialRelation(
    npc: NPCState,
    targetId: string,
    affinityDelta: number,
    currentYear: number,
  ): { updatedNpc: NPCState; relationChanged: boolean } {
    const existingIdx = npc.relations.findIndex((r) => r.targetId === targetId)
    const relations = [...npc.relations]

    if (existingIdx >= 0) {
      const existing = relations[existingIdx]!
      const newAffinity = clamp(existing.affinity + affinityDelta, -100, 100)
      const newType = NPCBehaviorSystem._determineRelationType(newAffinity, existing.type)
      relations[existingIdx] = {
        ...existing,
        affinity: newAffinity,
        type: newType,
        lastInteractionYear: currentYear,
      }
      return { updatedNpc: { ...npc, relations }, relationChanged: true }
    }

    // 新关系
    const newRelation: NPCRelation = {
      targetId,
      affinity: clamp(affinityDelta, -100, 100),
      type: NPCBehaviorSystem._determineRelationType(affinityDelta),
      description: '',
      lastInteractionYear: currentYear,
    }
    relations.push(newRelation)
    return { updatedNpc: { ...npc, relations }, relationChanged: true }
  }

  // ============================================================
  // 私有方法
  // ============================================================

  /** 从 Store 构建反派摘要文本 */
  private buildAntagonistSummary(characterId: string): string | null {
    const store = useNPCStore.getState()
    const allNPCs = Object.values(store.npcs).filter((n) => n.alive && n.antagonist?.isAntagonist)

    if (allNPCs.length === 0) return null

    const lines: string[] = ['【活跃反派】']

    for (const npc of allNPCs) {
      const antag = npc.antagonist!
      const tags = antag.antagonistTags
        .map((t) => ANTAGONIST_TAG_LABELS[t] ?? t)
        .join('/')

      // 与主角的关系
      const playerRelation = npc.relations.find((r) => r.targetId === characterId)
      const relationText = playerRelation
        ? `${playerRelation.type}·好感${playerRelation.affinity}`
        : '无关'

      lines.push(
        `- ${npc.name}（${tags}）· 威胁${antag.threatLevel}/100 · ${antag.conflictPhase} · ${relationText} · ${antag.motivation}`,
      )
    }

    return lines.join('\n')
  }

  /** 加权随机选择 */
  private static _weightedRandom(weights: BehaviorWeights): NPCBehaviorType {
    const entries = Object.entries(weights) as [NPCBehaviorType, number][]
    const total = entries.reduce((sum, [, w]) => sum + clamp(w, 0, Infinity), 0)
    if (total <= 0) return 'idle'

    let rand = Math.random() * total
    for (const [type, weight] of entries) {
      rand -= clamp(weight, 0, Infinity)
      if (rand <= 0) return type
    }

    return 'idle'
  }

  /** 根据关系值确定关系类型 */
  private static _determineRelationType(
    affinity: number,
    currentType?: NPCRelation['type'],
  ): NPCRelation['type'] {
    if (currentType === 'family' || currentType === 'master' || currentType === 'disciple') {
      return currentType // 不可变关系
    }
    if (affinity >= 60) return 'friend'
    if (affinity <= -60) return 'enemy'
    if (affinity <= -30) return 'rival'
    return 'neutral'
  }

  /** 生成行为叙事文本 */
  private static _generateNarrative(
    npc: NPCState,
    type: NPCBehaviorType,
    year: number,
  ): string {
    switch (type) {
      case 'idle':
        return `${npc.name}在${year}年静静地度过了一天`
      case 'trade':
        return `${npc.name}在${year}年进行了交易活动`
      case 'combat': {
        const enemy = npc.relations.find((r) => r.type === 'enemy')
        return enemy
          ? `${npc.name}在${year}年与对手发生了冲突`
          : `${npc.name}在${year}年遇到了战斗`
      }
      case 'social': {
        const friend = npc.relations.find((r) => r.type === 'friend')
        return friend
          ? `${npc.name}在${year}年与友人进行了社交`
          : `${npc.name}在${year}年结识了新朋友`
      }
      case 'move':
        return `${npc.name}在${year}年改变了所在地`
      case 'train':
        return `${npc.name}在${year}年潜心修炼`
      case 'work':
        return `${npc.name}在${year}年努力工作`
    }
  }
}
