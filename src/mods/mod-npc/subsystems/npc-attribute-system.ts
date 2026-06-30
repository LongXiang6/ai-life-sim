/**
 * @module NPCAttributeSystem
 * @description NPC 属性子系统 —— NPC 属性实例化、年龄增长、属性变化
 * @mod mod-npc
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import type { NPCState, NPCAttributes } from '../types'
import { DEFAULT_NPC_ATTRIBUTES } from '../constants'

export { DEFAULT_NPC_ATTRIBUTES }

/** 性格标签 → 属性修正映射 */
const TRAIT_MODIFIERS: Record<string, Partial<NPCAttributes>> = {
  '勇猛': { physique: 2, aggression: 15 },
  '狡猾': { mind: 2, greed: 15 },
  '仁慈': { aggression: -10, greed: -10 },
  '孤僻': { sociability: -15, charisma: -1 },
  '好学': { mind: 2, talentAptitude: 1 },
  '贪婪': { greed: 20, loyalty: -10 },
  '忠诚': { loyalty: 20 },
  '好斗': { aggression: 20, physique: 1 },
  '温和': { aggression: -10, sociability: 10 },
  '聪慧': { mind: 2, talentAptitude: 2 },
}

/** 反派标签 → 属性强化映射 */
export const ANTAGONIST_ATTRIBUTE_BOOSTS: Record<string, Partial<NPCAttributes>> = {
  arrogant_young_master: { aggression: 30, greed: 25, loyalty: -20 },
  scheming_elder: { mind: 3, aggression: 10, greed: 20 },
  corrupt_official: { greed: 30, aggression: 5, loyalty: -30 },
  rival_genius: { talentAptitude: 3, physique: 2, aggression: 15 },
  foreign_invader: { aggression: 35, physique: 3, greed: 10 },
  ancient_monster: { physique: 5, aggression: 40, talentAptitude: 3 },
  corporate_tycoon: { greed: 35, mind: 2, aggression: 5 },
  political_opponent: { mind: 3, loyalty: -25, aggression: 10 },
  custom: { aggression: 20, greed: 15 },
}

export class NPCAttributeSystem implements ISubSystem {
  readonly id = 'npc-attribute' as const
  readonly mod = 'mod-npc' as const
  readonly label = 'NPC 属性系统' as const
  readonly description = '管理 NPC 属性实例化、年龄增长和属性变化' as const

  collectState(_context: RoundContext): SubSystemState {
    return {
      id: this.id,
      summary: '【NPC 属性】由 NPC 行为系统驱动',
      data: {},
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    if (!changes || typeof changes !== 'object') return
    if (changes.id !== this.id) return
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) return

    // NPC 属性变更由 NPCBehaviorSystem 和 NPCMemorySystem 间接处理
    // 本系统主要负责初始化逻辑
  }

  reset(): void {
    // 无内部状态，由 Store 管理
  }

  // ============================================================
  // 公共方法
  // ============================================================

  /** 根据性格标签生成属性 */
  static generateAttributes(traits: string[]): NPCAttributes {
    const attrs: NPCAttributes = { ...DEFAULT_NPC_ATTRIBUTES }
    for (const trait of traits) {
      const mod = TRAIT_MODIFIERS[trait]
      if (mod) {
        for (const [key, value] of Object.entries(mod)) {
          if (key in attrs && typeof value === 'number') {
            ;(attrs as unknown as Record<string, number>)[key] += value
          }
        }
      }
    }
    // 钳制所有属性在合理范围
    const keys = Object.keys(attrs) as (keyof NPCAttributes)[]
    for (const key of keys) {
      attrs[key] = Math.max(-10, Math.min(10, attrs[key]))
    }
    return attrs
  }

  /** NPC 年龄增长 */
  static ageNPC(npc: NPCState, years: number): NPCState {
    return {
      ...npc,
      age: npc.age + years,
    }
  }
}
