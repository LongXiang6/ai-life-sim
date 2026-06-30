/**
 * @module RelationshipSystem
 * @description 关系子系统：好感度衰减、信任度变化、关系网络、羁绊系统、盟友原型推荐
 * @mod mod-culture
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { getRoundSequence } from '@/foundation'
import type { RelationshipState, RelationshipEntry, RelationshipType, BondType, AllyArchetype } from '../types'

import {
  AFFINITY_DECAY_PER_YEAR,
  AFFINITY_RANGE,
  RELATIONSHIP_LABELS,
  BOND_TYPE_LABELS,
  ALLY_PROTOTYPES,
  getRelationshipStatus,
  round,
  clamp,
} from '../constants'

export class RelationshipSystem implements ISubSystem {
  readonly id = 'relationship' as const
  readonly mod = 'mod-culture' as const
  readonly label = '关系系统' as const
  readonly description = '管理人脉好感度衰减、信任度变化、羁绊关系与盟友原型推荐' as const

  private state: RelationshipState = this.createInitialState()
  private _lastProcessedRound = -1

  private createInitialState(): RelationshipState {
    return {
      relationships: {},
    }
  }

  collectState(context: RoundContext): SubSystemState {
    if (getRoundSequence(context) === this._lastProcessedRound) {
      return {
        id: this.id,
        summary: this.getSummaryText(),
        data: structuredClone(this.state as unknown as Record<string, unknown>),
      }
    }
    this._lastProcessedRound = getRoundSequence(context)

    this.decayRelationships(1)

    return {
      id: this.id,
      summary: this.getSummaryText(),
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

    if (typeof c.yearsAdvanced === 'number') {
      this.decayRelationships(c.yearsAdvanced)
    }

    if (c.addRelationship === true && c.relationship && typeof c.relationship === 'object') {
      const rel = c.relationship as Record<string, unknown>
      const id = (rel.id as string) || `rel-${Date.now()}`
      const entry: RelationshipEntry = {
        id,
        name: (rel.name as string) || '未知',
        type: (rel.type as RelationshipType) || 'neutral',
        affinity: typeof rel.affinity === 'number' ? clamp(rel.affinity, AFFINITY_RANGE.min, AFFINITY_RANGE.max) : 0,
        trust: typeof rel.trust === 'number' ? clamp(rel.trust, 0, 100) : 50,
        metYear: typeof rel.metYear === 'number' ? rel.metYear : 0,
        lastInteractionYear: typeof rel.lastInteractionYear === 'number' ? rel.lastInteractionYear : 0,
        notes: (rel.notes as string) || '',
      }
      // 可选羁绊字段
      if (rel.bondType && typeof rel.bondType === 'string') {
        entry.bondType = rel.bondType as BondType
        entry.bondIntensity = typeof rel.bondIntensity === 'number' ? clamp(rel.bondIntensity, 0, 100) : 50
        entry.bondEstablishedYear = typeof rel.bondEstablishedYear === 'number' ? rel.bondEstablishedYear : (rel.metYear as number) || 0
        entry.bondBroken = rel.bondBroken === true
        entry.bondDescription = (rel.bondDescription as string) || ''
      }
      this.state.relationships[id] = entry
    }

    if (c.removeRelationship === true && typeof c.relationshipId === 'string') {
      delete this.state.relationships[c.relationshipId]
    }

    if (typeof c.adjustAffinity === 'number' && typeof c.relationshipId === 'string') {
      const rel = this.state.relationships[c.relationshipId]
      if (rel) {
        let delta = c.adjustAffinity
        if (delta < 0 && rel.trust > 0) {
          delta *= (1 - rel.trust / 100 * 0.3)
        }
        rel.affinity = round(clamp(rel.affinity + delta, AFFINITY_RANGE.min, AFFINITY_RANGE.max))
        rel.lastInteractionYear = 0
      }
    }

    if (typeof c.setTrust === 'number' && typeof c.relationshipId === 'string') {
      const rel = this.state.relationships[c.relationshipId]
      if (rel) {
        rel.trust = round(clamp(c.setTrust, 0, 100))
      }
    }

    // ── 羁绊操作 ──
    if (c.setBond === true && typeof c.relationshipId === 'string' && typeof c.bondType === 'string') {
      const rel = this.state.relationships[c.relationshipId]
      if (rel) {
        rel.bondType = c.bondType as BondType
        rel.bondIntensity = typeof c.bondIntensity === 'number' ? clamp(c.bondIntensity, 0, 100) : 50
        rel.bondEstablishedYear = typeof c.bondEstablishedYear === 'number' ? c.bondEstablishedYear : 0
        rel.bondBroken = c.bondBroken === true
        rel.bondDescription = (c.bondDescription as string) || ''
      }
    }

    if (c.removeBond === true && typeof c.relationshipId === 'string') {
      const rel = this.state.relationships[c.relationshipId]
      if (rel) {
        rel.bondType = undefined
        rel.bondIntensity = undefined
        rel.bondEstablishedYear = undefined
        rel.bondBroken = undefined
        rel.bondDescription = undefined
      }
    }

    if (c.breakBond === true && typeof c.relationshipId === 'string') {
      const rel = this.state.relationships[c.relationshipId]
      if (rel) {
        rel.bondBroken = true
      }
    }
  }

  // ─── 内部逻辑 ───

  private decayRelationships(years: number): void {
    const entries = Object.values(this.state.relationships)
    for (const rel of entries) {
      const yearsSinceInteraction = Math.max(0, years + rel.lastInteractionYear)
      const decayAmount = AFFINITY_DECAY_PER_YEAR * yearsSinceInteraction * 0.5
      rel.affinity = round(clamp(rel.affinity - decayAmount, AFFINITY_RANGE.min, AFFINITY_RANGE.max))

      if (rel.trust > 0) {
        rel.trust = round(clamp(rel.trust - years * 0.3, 0, 100))
      }

      rel.lastInteractionYear += years
    }
  }

  // ─── 领域方法 ───

  getRelationshipCount(): number {
    return Object.keys(this.state.relationships).length
  }

  getRelationship(id: string): RelationshipEntry | undefined {
    return this.state.relationships[id]
  }

  getAllRelationships(): RelationshipEntry[] {
    return Object.values(this.state.relationships)
  }

  getRecommendedAllyArchetypes(worldview: string, lifeStage: string, limit = 3): AllyArchetype[] {
    const scored = ALLY_PROTOTYPES.map((prototype) => {
      const worldviewWeight = prototype.worldviewWeights[worldview] ?? 0.5
      const lifeStageMatch = prototype.preferredLifeStages.includes(lifeStage) ? 1.0 : 0.3
      const score = worldviewWeight * 0.6 + lifeStageMatch * 0.4
      return { prototype, score }
    })
    scored.sort((a, b) => b.score - a.score)
    return scored.slice(0, limit).map((s) => s.prototype)
  }

  formatForPrompt(): string {
    const sb: string[] = []
    const count = this.getRelationshipCount()
    sb.push(`【关系网络】共有 ${count} 段关系`)

    if (count === 0) {
      sb.push('  无任何关系记录')
      return sb.join('\n')
    }

    const sorted = this.getAllRelationships()
      .sort((a, b) => b.affinity - a.affinity)

    sb.push('── 友好关系 ──')
    const friends = sorted.filter((r) => r.affinity > 20)
    if (friends.length === 0) sb.push('  无')
    else {
      for (const f of friends) {
        const status = getRelationshipStatus(f.affinity)
        let line = `  ${f.name}（${RELATIONSHIP_LABELS[f.type]}） · ${status.label}（${f.affinity}） · 信任：${f.trust}`
        if (f.bondType && !f.bondBroken) {
          const bondLabel = BOND_TYPE_LABELS[f.bondType] || f.bondType
          line += ` · [${bondLabel}：${f.bondIntensity}]`
          if (f.bondDescription) line += ` ${f.bondDescription}`
        }
        sb.push(line)
      }
    }

    sb.push('── 敌对关系 ──')
    const enemies = sorted.filter((r) => r.affinity <= 20)
    if (enemies.length === 0) sb.push('  无')
    else {
      for (const e of enemies) {
        const status = getRelationshipStatus(e.affinity)
        let line = `  ${e.name}（${RELATIONSHIP_LABELS[e.type]}） · ${status.label}（${e.affinity}） · 信任：${e.trust}`
        if (e.bondType && !e.bondBroken) {
          const bondLabel = BOND_TYPE_LABELS[e.bondType] || e.bondType
          line += ` · [${bondLabel}：${e.bondIntensity}]`
        }
        sb.push(line)
      }
    }

    return sb.join('\n')
  }

  private getSummaryText(): string {
    const count = this.getRelationshipCount()
    const entries = this.getAllRelationships()
    const types = entries.reduce<Record<string, number>>((acc, r) => {
      acc[r.type] = (acc[r.type] || 0) + 1
      return acc
    }, {})
    const typeSummary = Object.entries(types)
      .map(([t, c]) => `${RELATIONSHIP_LABELS[t as RelationshipType] || t}×${c}`)
      .join('、')

    const bondCount = entries.filter((r) => r.bondType && !r.bondBroken).length

    return `【${this.label}】关系数：${count}${typeSummary ? `（${typeSummary}）` : ''}${bondCount > 0 ? ` · 羁绊：${bondCount}` : ''}`
  }

  reset(): void {
    this.state = this.createInitialState()
    this._lastProcessedRound = -1
  }
}
