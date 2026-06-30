/**
 * @module SupremeItemSystem
 * @description 至尊物品子系统 —— 超凡物品管理、觉醒机制、叙事检测
 * @mod mod-power-system
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { getRoundSequence } from '@/foundation'
import type { SupremeItemState, SupremeItem, AwakeningCondition, AwakeningCheckContext } from '../types'
import { WORLDVIEW_TO_ITEM_TYPE } from '../constants'

const SUPREME_ITEM_DEFINITIONS: Record<string, SupremeItem[]> = {
  cultivation: [
    { id: 'heavenly_sword', name: '诛天剑', description: '上古神兵，曾斩落天道的一角', tier: 'mythic', worldview: 'cultivation', awakened: false },
    { id: 'chaos_cauldron', name: '混沌鼎', description: '可炼化万物的太古至宝', tier: 'mythic', worldview: 'cultivation', awakened: false },
    { id: 'immortal_jade', name: '先天灵玉', description: '蕴含完整大道的先天灵物', tier: 'legendary', worldview: 'cultivation', awakened: false },
    { id: 'kun_peng_scroll', name: '鲲鹏真经', description: '记载鲲鹏变化之法的太古天书', tier: 'legendary', worldview: 'cultivation', awakened: false },
    { id: 'void_mirror', name: '虚空镜', description: '可映照万物本源的先天至宝', tier: 'legendary', worldview: 'cultivation', awakened: false },
  ],
  western_fantasy: [
    { id: 'excalibur', name: '王者之剑', description: '选王之剑，持有者加冕为王', tier: 'mythic', worldview: 'western_fantasy', awakened: false },
    { id: 'philosopher_stone', name: '贤者之石', description: '点石成金的终极炼金造物', tier: 'legendary', worldview: 'western_fantasy', awakened: false },
    { id: 'world_seed', name: '世界树种子', description: '蕴含创世之力的神圣种子', tier: 'mythic', worldview: 'western_fantasy', awakened: false },
  ],
  scifi: [
    { id: 'prime_artifact', name: '先驱者遗物', description: '远古超文明留下的造物装置', tier: 'mythic', worldview: 'scifi', awakened: false },
    { id: 'dimensional_drive', name: '维度引擎', description: '可撕裂空间的超文明装置', tier: 'legendary', worldview: 'scifi', awakened: false },
    { id: 'consciousness_core', name: '意识核心', description: '储存着超文明全部知识的量子核心', tier: 'legendary', worldview: 'scifi', awakened: false },
  ],
  post_apocalyptic: [
    { id: 'ark_fragment', name: '方舟碎片', description: '远古文明遗留的求生装置残骸', tier: 'legendary', worldview: 'post_apocalyptic', awakened: false },
    { id: 'genesis_code', name: '创世纪代码', description: '可重塑生物基因的远古程序', tier: 'mythic', worldview: 'post_apocalyptic', awakened: false },
  ],
  crafted: [
    { id: 'prototype_mk1', name: '原型机·壹式', description: '旧纪元最后一位科学家倾尽毕生心血打造的终极造物', tier: 'legendary', worldview: 'crafted', awakened: false },
    { id: 'creator_engine', name: '造物主引擎', description: '传说中能赋予无机物生命的奇迹装置', tier: 'mythic', worldview: 'crafted', awakened: false },
    { id: 'nanite_swarm', name: '纳米集群核心', description: '可重塑万物分子结构的智能纳米集群控制核心', tier: 'legendary', worldview: 'crafted', awakened: false },
  ],
}

export class SupremeItemSystem implements ISubSystem {
  readonly id = 'supreme-item' as const
  readonly mod = 'mod-power-system' as const
  readonly label = '至尊物品' as const
  readonly description = '管理超凡物品：定义池、获取/移除、觉醒机制、世界观过滤' as const

  private _state: SupremeItemState = { initialized: false, items: [] }
  private _lastProcessedRound = -1

  collectState(context: RoundContext): SubSystemState {
    if (getRoundSequence(context) === this._lastProcessedRound) return this._buildResult()
    this._lastProcessedRound = getRoundSequence(context)
    if (!this._state.initialized) { this._state.initialized = true }
    return this._buildResult()
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    const { id } = changes;
    const plain = changes.changes ?? {};
    const desc = changes.description ?? '';
    void desc;
    void changes.changes;
    if (!changes?.changes || changes.id !== this.id) return
    const c = changes.changes
    if (c.itemId && c.action === 'add') {
      const worldview = (c.worldview as string) || 'cultivation'
      const poolKey = WORLDVIEW_TO_ITEM_TYPE[worldview] ?? 'cultivation'
      const pool = SUPREME_ITEM_DEFINITIONS[poolKey] ?? SUPREME_ITEM_DEFINITIONS['cultivation']
      const def = pool.find(i => i.id === c.itemId)
      if (def && !this._state.items.find(i => i.id === def.id)) {
        this._state.items.push({ ...def })
      }
    }
    if (c.itemId && c.action === 'awaken') {
      const item = this._state.items.find(i => i.id === c.itemId)
      if (item) item.awakened = true
    }
    if (c.itemId && c.action === 'remove') {
      this._state.items = this._state.items.filter(i => i.id !== c.itemId)
    }
    void id; void plain;
  }

  reset(): void { this._state = { initialized: false, items: [] }; this._lastProcessedRound = -1 }

  /** 从叙事中检测超凡物品 */
  detectFromNarrative(narrative: string, worldview: string): SupremeItem | null {
    const poolKey = WORLDVIEW_TO_ITEM_TYPE[worldview] ?? 'cultivation'
    const pool = SUPREME_ITEM_DEFINITIONS[poolKey] ?? []
    for (const def of pool) {
      if (narrative.includes(def.name) && !this._state.items.find(i => i.id === def.id)) return def
    }
    return null
  }

  /** 检查物品是否满足自动觉醒条件 */
  checkAwakening(item: SupremeItem, condition: AwakeningCondition, state: AwakeningCheckContext): boolean {
    if (item.awakened) return false
    const { trigger } = condition

    if (trigger.startsWith('round_count')) {
      const match = trigger.match(/round_count\s*(>=|<=|>|<|==)\s*(\d+)/)
      if (!match) return false
      const operator = match[1]
      const value = parseInt(match[2], 10)
      switch (operator) {
        case '>=': return state.roundCount >= value
        case '<=': return state.roundCount <= value
        case '>': return state.roundCount > value
        case '<': return state.roundCount < value
        case '==': return state.roundCount === value
        default: return false
      }
    }

    if (trigger.startsWith('narrative_matches:')) {
      const keyword = trigger.slice('narrative_matches:'.length)
      if (!keyword || !state.narrative) return false
      return state.narrative.includes(keyword)
    }

    return false
  }

  private _buildResult(): SubSystemState {
    const s = this._state
    if (s.items.length === 0) return { id: this.id, summary: '无超凡物品', data: structuredClone(s as unknown as Record<string, unknown>) }
    const parts = s.items.map(i => `${i.name}${i.awakened ? '（已觉醒）' : ''}`)
    return { id: this.id, summary: parts.join(' | '), data: structuredClone(s as unknown as Record<string, unknown>) }
  }
}
