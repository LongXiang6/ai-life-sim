/**
 * @module FortuneEncounterSystem
 * @description 机缘奇遇子系统 —— 3品质随机奇遇触发、冷却、运气联动
 * @mod mod-power-system
 */
import { getRoundSequence } from '@/foundation'

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'

import { DIFFICULTY_MULTIPLIERS_FORTUNE } from '@/foundation'

import { getFormulaModifier } from '@/mods/mod-world'

import type { FortuneEncounterState, EncounterEvent } from '../types'

const BASE_ENCOUNTER_CHANCE: Record<string, number> = { legendary: 0.06, major: 0.15, minor: 0.30 }
const LUCK_MULTIPLIER_PER_POINT = 0.02
const MIN_COOLDOWN: Record<string, number> = { legendary: 10, major: 5, minor: 2 }
const TIER_LABELS: Record<string, string> = { legendary: '逆天奇遇', major: '大机缘', minor: '小机缘' }

const ENCOUNTER_POOL: EncounterEvent[] = [
  { id: 'ancient_ruins', tier: 'legendary', name: '上古遗迹', description: '发现一座上古时期的隐秘遗迹', narrativeHint: '遗迹深处有强大的能量波动' },
  { id: 'master_encounter', tier: 'legendary', name: '隐世高人', description: '偶遇一位隐居的神秘高人', narrativeHint: '高人似乎认识你的师门长辈' },
  { id: 'treasure_map', tier: 'major', name: '藏宝图', description: '获得一张标记未知宝藏的地图', narrativeHint: '地图上有古老文字标注的危险区域' },
  { id: 'spirit_herb', tier: 'major', name: '千年灵药', description: '发现一株千年灵药', narrativeHint: '周围有妖兽守护，采摘不易' },
  { id: 'strange_merchant', tier: 'major', name: '神秘商人', description: '遇到一位自称来自天外的商人', narrativeHint: '他用的是从未见过的交易货币' },
  { id: 'luck_stone', tier: 'minor', name: '幸运石', description: '捡到一颗泛着微光的石头', narrativeHint: '握在手中有温暖的感觉' },
  { id: 'wandering_elder', tier: 'minor', name: '游历长者', description: '遇到一位游历的长者', narrativeHint: '长者分享了一段有趣的往事' },
  { id: 'hidden_spring', tier: 'minor', name: '灵泉', description: '发现一口灵气充裕的泉水', narrativeHint: '泉水旁长有罕见的花草' },
  { id: 'celestial_trial', tier: 'legendary', name: '天道试炼', description: '天道降下考验，通过者获逆天造化', narrativeHint: '九重雷劫轰然而下，每一重都是生死考验' },
  { id: 'realm_rift', tier: 'legendary', name: '位面裂缝', description: '发现通往异世界的裂缝', narrativeHint: '裂缝中透出陌生世界的气息' },
  { id: 'ancient_library', tier: 'major', name: '太古藏书阁', description: '发现失传已久的太古功法', narrativeHint: '功法玉简散发着远古大能的意志' },
  { id: 'dragon_lair', tier: 'major', name: '龙族秘窟', description: '误入龙族隐藏的宝藏洞穴', narrativeHint: '洞穴深处传来低沉的龙吟' },
  { id: 'mystic_fruit', tier: 'minor', name: '灵果', description: '偶然发现一颗奇异果实', narrativeHint: '果实散发着沁人心脾的香气' },
  { id: 'old_friend', tier: 'minor', name: '故人重逢', description: '在异乡遇到儿时好友', narrativeHint: '对方的容貌依稀可辨' },
]

export class FortuneEncounterSystem implements ISubSystem {
  readonly id = 'fortune-encounter' as const
  readonly mod = 'mod-power-system' as const
  readonly label = '机缘奇遇' as const
  readonly description = '管理3品质随机奇遇：触发判定、冷却机制、运气联动、事件去重' as const

  private _state: FortuneEncounterState = {
    initialized: false, cooldownRounds: 0, lastTriggerEraYear: 0, totalEncounters: 0, activeEncounter: null,
    lastEncounterId: null,
  }
  private _lastProcessedRound = -1

  collectState(context: RoundContext): SubSystemState {
    if (getRoundSequence(context) === this._lastProcessedRound) return this._buildResult()
    this._lastProcessedRound = getRoundSequence(context)
    this._roll(context)
    return this._buildResult()
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    const { id } = changes;
    const plain = changes.changes ?? {};
    const desc = changes.description ?? '';
    void desc;
    void changes.changes;
    if (!changes?.changes || changes.id !== this.id) return
    if (typeof changes.changes.activeEncounter === 'string') {
      this._state.activeEncounter = ENCOUNTER_POOL.find(e => e.id === changes.changes.activeEncounter) ?? null
    }
    void id; void plain;
  }

  reset(): void {
    this._state = { initialized: false, cooldownRounds: 0, lastTriggerEraYear: 0, totalEncounters: 0, activeEncounter: null, lastEncounterId: null }
    this._lastProcessedRound = -1
  }

  private _roll(context: RoundContext): void {
    if (this._state.cooldownRounds > 0) { this._state.cooldownRounds--; this._state.activeEncounter = null; return }
    const luckData = context.subsystemStates['luck']?.data as Record<string, unknown> | undefined
    const luckBonus = (luckData?.luck as number) ?? 0
    const goldenActive = (context.subsystemStates['golden-finger']?.data as Record<string, unknown> | undefined)?.assigned as boolean ?? false
    const diffMult = DIFFICULTY_MULTIPLIERS_FORTUNE[context.difficulty] ?? 1
    const luckPointMod = getFormulaModifier('luckPointModifier')
    const luckMult = 1 + luckBonus * LUCK_MULTIPLIER_PER_POINT * luckPointMod
    const goldenBoost = goldenActive ? 1.5 : 1.0

    const tiers = ['legendary', 'major', 'minor'] as const
    for (const tier of tiers) {
      const chance = Math.min(BASE_ENCOUNTER_CHANCE[tier] * luckMult * diffMult * goldenBoost, tier === 'legendary' ? 0.08 : tier === 'major' ? 0.20 : 0.40)
      if (Math.random() < chance) {
        const pool = ENCOUNTER_POOL.filter(e => e.tier === tier && e.id !== this._state.lastEncounterId)
        const selected = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : ENCOUNTER_POOL.filter(e => e.tier === tier)[Math.floor(Math.random() * ENCOUNTER_POOL.filter(e => e.tier === tier).length)]
        if (selected) {
          this._state.activeEncounter = selected
          this._state.lastEncounterId = selected.id
          this._state.cooldownRounds = MIN_COOLDOWN[tier]
          this._state.totalEncounters++
          this._state.initialized = true
          return
        }
      }
    }
    this._state.activeEncounter = null
  }

  private _buildResult(): SubSystemState {
    const s = this._state
    if (!s.activeEncounter) return { id: this.id, summary: `冷却剩余${s.cooldownRounds}轮 | 累计${s.totalEncounters}次奇遇`, data: structuredClone(s as unknown as Record<string, unknown>) }
    const enc = s.activeEncounter
    return { id: this.id, summary: `【${TIER_LABELS[enc.tier]}】${enc.name}：${enc.description}`, data: structuredClone(s as unknown as Record<string, unknown>) }
  }
}
