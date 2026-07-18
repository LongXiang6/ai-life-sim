/**
 * @module NationRelationSystem
 * @description 国家关系子系统：tension/peace 双计数器关系演化、战争消耗、国力波动
 * @mod mod-politics
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { getRoundSequence } from '@/foundation'
import type { NationRelationState, NationRelationEntry, DiplomaticStance } from '../types'

import {
  NATION_RELATION_RANGE,
  NATION_TENSION_WAR_THRESHOLD,
  NATION_PEACE_ALLY_THRESHOLD,
  NATION_TENSION_DECAY,
  NATION_WAR_PEACE_GAIN,
  NATION_WAR_END_TO_HOSTILE,
  NATION_WAR_DAMAGE_BASE,
  NATION_WAR_DAMAGE_RANDOM,
  NATION_POWER_DRIFT,
  NATION_PROSPERITY_DRIFT,
  DIPLOMATIC_STANCE_LABELS,
} from '../constants'
import { round, clamp } from '../utils'

import { getFormulaModifier } from '@/mods/mod-world'

export class NationRelationSystem implements ISubSystem {
  readonly id = 'nation-relation' as const
  readonly mod = 'mod-politics' as const
  readonly label = '国家关系' as const
  readonly description = '管理国家间外交关系演化、tension/peace 双计数器、战争与和平动态' as const

  private state = this.createInitialState()
  private _lastProcessedRound = -1

  private createInitialState(): NationRelationState {
    return {
      relations: [],
    }
  }

  collectState(context: RoundContext): SubSystemState {
    if (getRoundSequence(context) === this._lastProcessedRound) {
      return {
        id: this.id,
        summary: this.buildSummary(),
        data: structuredClone(this.state as unknown as Record<string, unknown>),
      }
    }
    this._lastProcessedRound = getRoundSequence(context)

    this.advanceRelations()

    return {
      id: this.id,
      summary: this.buildSummary(),
      data: structuredClone(this.state as unknown as Record<string, unknown>),
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    if (!changes || typeof changes !== 'object') {
      throw new Error(`[${this.id}] Invalid changes: expected object`)
    }
    if (changes.id !== this.id) {
      throw new Error(`[${this.id}] Changes ID mismatch`)
    }
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) {
      throw new Error(`[${this.id}] Invalid changes.changes: expected plain object`)
    }
    if (!changes.description || changes.description.trim() === '') {
      throw new Error(`[${this.id}] Missing changes.description`)
    }
    const c = changes.changes as Record<string, unknown>

    // 添加/更新国家关系
    if (Array.isArray(c.addRelations)) {
      for (const rel of c.addRelations as Partial<NationRelationEntry>[]) {
        if (rel.nationId) {
          const idx = this.state.relations.findIndex((r) => r.nationId === rel.nationId)
          if (idx >= 0) {
            this.state.relations[idx] = { ...this.state.relations[idx], ...rel }
          } else {
            this.state.relations.push({
              nationId: rel.nationId,
              nationName: rel.nationName ?? rel.nationId,
              stance: rel.stance ?? 'neutral',
              relation: clamp(rel.relation ?? 0, NATION_RELATION_RANGE.min, NATION_RELATION_RANGE.max),
              tradeVolume: rel.tradeVolume ?? 0,
              hasMarriageAlliance: rel.hasMarriageAlliance ?? false,
              tension: rel.tension ?? 0,
              peace: rel.peace ?? 0,
              aggressiveness: rel.aggressiveness ?? 40,
              power: rel.power ?? 50,
              prosperity: rel.prosperity ?? 50,
              recentEvents: rel.recentEvents ?? [],
            })
          }
        }
      }
    }

    // 删除国家关系
    if (Array.isArray(c.removeRelationIds)) {
      const removeIds = new Set(c.removeRelationIds as string[])
      this.state.relations = this.state.relations.filter((r) => !removeIds.has(r.nationId))
    }

    // 直接设置关系值
    if (typeof c.nationId === 'string' && typeof c.relation === 'number') {
      const entry = this.state.relations.find((r) => r.nationId === c.nationId)
      if (entry) {
        entry.relation = clamp(c.relation, NATION_RELATION_RANGE.min, NATION_RELATION_RANGE.max)
      }
    }

    // 设置外交立场
    if (typeof c.nationId === 'string' && typeof c.stance === 'string') {
      const entry = this.state.relations.find((r) => r.nationId === c.nationId)
      if (entry) {
        entry.stance = c.stance as DiplomaticStance
      }
    }

    // 设置贸易量
    if (typeof c.nationId === 'string' && typeof c.tradeVolume === 'number') {
      const entry = this.state.relations.find((r) => r.nationId === c.nationId)
      if (entry) {
        entry.tradeVolume = clamp(c.tradeVolume, 0, Infinity)
      }
    }

    // 设置婚姻联盟
    if (typeof c.nationId === 'string' && typeof c.hasMarriageAlliance === 'boolean') {
      const entry = this.state.relations.find((r) => r.nationId === c.nationId)
      if (entry) {
        entry.hasMarriageAlliance = c.hasMarriageAlliance
      }
    }
  }

  reset(): void {
    this.state = this.createInitialState()
    this._lastProcessedRound = -1
  }

  // ─── 内部推进逻辑 ───

  private advanceRelations(): void {
    for (const rel of this.state.relations) {
      // 0. 国力 + 繁荣度自然波动
      rel.power = clamp(
        round(rel.power + (Math.random() - 0.5) * NATION_POWER_DRIFT),
        0, 100,
      )
      rel.prosperity = clamp(
        round(rel.prosperity + (Math.random() - 0.5) * NATION_PROSPERITY_DRIFT),
        0, 100,
      )

      if (rel.stance === 'war') {
        // ── 战争状态 ──
        // 战争消耗：繁荣度下降
        const warDamage = (NATION_WAR_DAMAGE_BASE + Math.floor(Math.random() * NATION_WAR_DAMAGE_RANDOM))
          * getFormulaModifier('warDamageModifier')
        rel.prosperity = clamp(round(rel.prosperity - warDamage), 0, 100)
        rel.relation = clamp(rel.relation - 2, NATION_RELATION_RANGE.min, NATION_RELATION_RANGE.max)

        // 战争期间 peace 缓慢积累
        rel.peace += NATION_WAR_PEACE_GAIN
        rel.tension = clamp(rel.tension - 5, 0, Infinity)

        // 战争结束检测：peace 积累足够 or 随机
        if (rel.peace >= NATION_PEACE_ALLY_THRESHOLD || Math.random() < 0.08) {
          rel.recentEvents.push(`${rel.nationName}战争结束`)

          // 战争结束后转为 hostile（概率）或 neutral
          if (Math.random() < NATION_WAR_END_TO_HOSTILE) {
            rel.stance = 'hostile'
          } else {
            rel.stance = 'neutral'
          }
          rel.tension = clamp(rel.tension - 30, 0, Infinity)
          rel.peace = 0
        }
      } else if (rel.stance === 'hostile') {
        // ── 敌对状态 ──
        // 侵略性驱动紧张度积累
        const tensionGain = (rel.aggressiveness - 20) * 0.1 + (Math.random() - 0.5) * 2
        rel.tension = clamp(rel.tension + round(tensionGain), 0, Infinity)
        rel.relation = clamp(rel.relation - 1, NATION_RELATION_RANGE.min, NATION_RELATION_RANGE.max)

        // 战争检测：紧张度 >= 阈值
        if (rel.tension >= NATION_TENSION_WAR_THRESHOLD / getFormulaModifier('warFrequencyModifier')) {
          rel.stance = 'war'
          rel.recentEvents.push(`${rel.nationName}→宣战！`)
        }
      } else if (rel.stance === 'ally') {
        // ── 同盟状态 ──
        rel.peace += (Math.random() - 0.3) * 1.5
        rel.peace = clamp(rel.peace, 0, Infinity)
        rel.tension = clamp(rel.tension - NATION_TENSION_DECAY, 0, Infinity)
        rel.relation = clamp(rel.relation + 1, NATION_RELATION_RANGE.min, NATION_RELATION_RANGE.max)

        // 婚姻联盟额外加成
        if (rel.hasMarriageAlliance) {
          rel.relation = clamp(rel.relation + 1, NATION_RELATION_RANGE.min, NATION_RELATION_RANGE.max)
        }
      } else {
        // ── 中立/vassal/overlord ──
        // 紧张度自然衰减
        rel.tension = clamp(rel.tension - NATION_TENSION_DECAY, 0, Infinity)

        // 和平度变化：受侵略性影响
        const peaceGain = (Math.random() - rel.aggressiveness / 200) * 1.5
        rel.peace = clamp(rel.peace + round(peaceGain), 0, Infinity)
      }

      // 贸易量自然波动
      const tradeDrift = (Math.random() - 0.45) * 3
      rel.tradeVolume = round(clamp(rel.tradeVolume + tradeDrift, 0, Infinity))

      // 关系漂移：向立场中性值靠拢
      const stanceTarget = this.getStanceTargetRelation(rel.stance)
      const driftRate = 0.5
      const drift = (stanceTarget - rel.relation) * driftRate * 0.1
      rel.relation = clamp(round(rel.relation + drift), NATION_RELATION_RANGE.min, NATION_RELATION_RANGE.max)

    }
  }

  private getStanceTargetRelation(stance: DiplomaticStance): number {
    switch (stance) {
      case 'ally': return 80
      case 'neutral': return 0
      case 'hostile': return -50
      case 'war': return -90
      case 'vassal': return 50
      case 'overlord': return 60
      default: return 0
    }
  }

  // ─── 领域方法 ───

  getAllyCount(): number {
    return this.state.relations.filter((r) => r.stance === 'ally').length
  }

  getEnemyCount(): number {
    return this.state.relations.filter((r) => r.stance === 'hostile' || r.stance === 'war').length
  }

  getWarCount(): number {
    return this.state.relations.filter((r) => r.stance === 'war').length
  }

  /** 是否有活跃战争 */
  isWarActive(): boolean {
    return this.state.relations.some((r) => r.stance === 'war')
  }

  /** 格式化国家关系信息供 AI Prompt 使用 */
  formatForPrompt(): string {
    const lines: string[] = []

    if (this.state.relations.length === 0) {
      return '【国家关系】无已知国家'
    }

    // 国家概览
    lines.push('诸国概览：')
    for (const rel of this.state.relations) {
      const stanceLabel = DIPLOMATIC_STANCE_LABELS[rel.stance] ?? rel.stance
      lines.push(
        `  ${rel.nationName}（国力 ${rel.power} / 繁荣 ${rel.prosperity} / 侵略性 ${rel.aggressiveness}）→ ${stanceLabel}（关系 ${rel.relation}）`,
      )
    }

    // 战争状态
    const wars = this.state.relations.filter((r) => r.stance === 'war')
    if (wars.length > 0) {
      lines.push('⚔ 交战国：')
      for (const w of wars) {
        lines.push(`  ${w.nationName}（紧张度 ${w.tension} / 和平积累 ${w.peace}）`)
      }
    }

    // 外交事件
    const allEvents = this.state.relations.flatMap((r) => r.recentEvents)
    if (allEvents.length > 0) {
      lines.push('最近外交事件：')
      for (const evt of allEvents) {
        lines.push(`  · ${evt}`)
      }
    }

    return lines.join('\n')
  }

  // ─── 摘要构建 ───

  private buildSummary(): string {
    const allyCount = this.getAllyCount()
    const enemyCount = this.getEnemyCount()
    const warCount = this.getWarCount()
    const totalCount = this.state.relations.length
    let summary = `【${this.label}】同盟: ${allyCount}, 敌对: ${enemyCount}, 交战中: ${warCount}, 总计: ${totalCount}国`
    if (warCount > 0) summary += ' ⚔'
    return summary
  }
}
