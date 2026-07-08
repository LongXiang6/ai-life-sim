/**
 * @module character-base-system.ts
 * @description 角色基础属性子系统
 * @mod mod-character
 */

import type { ISubSystem, RoundContext, SubSystemState, SubSystemChanges } from '@/foundation'
import type { BaseAttributes, AttributeModifiers, CharacterBaseState, RaceLifespanConfig } from '../types'

import {
  MIN_ATTRIBUTE_VALUE,
  MAX_ATTRIBUTE_VALUE,
  ATTR_HARD_CAP,
  TRANSCENDENT_ATTR_KEYS,
} from '../constants'
import { round } from '../utils'
import { clamp, clampCharacterAttributeDelta, detectStartingAge } from '@/core/shared'
import { getAttrSemantic } from '../utils/attr-tiers'

export class CharacterBaseSystem implements ISubSystem {
  readonly id = 'character-base' as const
  readonly mod = 'mod-character' as const
  readonly label = '基础属性' as const
  readonly description = '管理 5 项基础属性（体魄 / 心智 / 悟性 / 魅力 / 出身），聚合命格 / 伤病 / 衰减的修正叠加，检测穿越者起始年龄' as const

  private state: CharacterBaseState = {
    base: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0, resources: 0 },
    current: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0, resources: 0 },
    modifiers: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0, resources: 0 },
    startingAge: 0,
  }

  /**
   * collectState 在此处执行聚合计算是因为需要读取 context 中其他子系统
   * 的最新状态。该操作是幂等的（每次从零重新聚合），两次调用结果一致。
   * 写入 this.state 是为了让其他子系统（如 HealthSystem）能通过
   * context.subsystemStates['character-base'].data 读取最新 current 属性。
   */
  collectState(context: RoundContext): SubSystemState {
    // 从其他子系统聚合修正
    this.aggregateModifiers(context)

    // 计算 current = clamp(base + modifiers, MIN, MAX)
    this.recalculateCurrent()

    const s = this.state
    const lines: string[] = []
    for (const key of ['physique', 'mind', 'talentAptitude', 'charisma', 'resources'] as const) {
      const base = s.base[key]
      const mod = s.modifiers[key]
      const modStr = mod !== 0 ? (mod > 0 ? `+${mod}` : `${mod}`) : ''
      const semanticDesc = getAttrSemantic(key, base)
      lines.push(`${this.getAttrKeyLabel(key, base)}${modStr ? `(${modStr})` : ''}：${semanticDesc}`)
    }

    return {
      id: this.id,
      summary: `【${this.label}】${lines.join(' | ')} | 起始年龄 ${s.startingAge}`,
      data: structuredClone({
        base: s.base,
        current: s.current,
        modifiers: s.modifiers,
        startingAge: s.startingAge,
      }),
    }
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (!changes || typeof changes !== 'object') return
    if (changes.id !== this.id) return
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) return
    if (!changes.description || changes.description.trim() === '') return

    const ch = changes.changes

    // 背景文本：用于穿越者检测，自动设置起始年龄
    if (typeof ch.background === 'string') {
      this.state.startingAge = detectStartingAge(ch.background)
    }

    // 直接设置起始年龄（手动覆盖，优先级高于自动检测）
    if (typeof ch.startingAge === 'number') {
      this.state.startingAge = clamp(ch.startingAge, 0, Infinity)
    }

    // 主契约（P0）：扁平增量字段 physiqueDelta / mindDelta / talentAptitudeDelta /
    //   charismaDelta / resourcesDelta。单轮增量由 balance-config 按 daysPassed 缩放，
    //   叠加后再按属性类别（可超凡/凡人锁定）钳制最终值。
    for (const key of ['physique', 'mind', 'talentAptitude', 'charisma', 'resources'] as const) {
      const raw = ch[`${key}Delta`]
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        const delta = clampCharacterAttributeDelta(raw, key, context.daysPassed)
        this.state.base[key] = round(this.clampAttr(key, this.state.base[key] + delta))
      }
    }

    // 兼容契约（P1）：嵌套 base 绝对值 { base: { physique: N } }（老格式/手动覆盖）
    if (ch.base && typeof ch.base === 'object') {
      const b = ch.base as Partial<BaseAttributes>
      for (const key of ['physique', 'mind', 'talentAptitude', 'charisma', 'resources'] as const) {
        if (typeof b[key] === 'number') {
          this.state.base[key] = round(this.clampAttr(key, b[key]!))
        }
      }
    }

    this.recalculateCurrent()
  }

  reset(): void {
    this.state = {
      base: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0, resources: 0 },
      current: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0, resources: 0 },
      modifiers: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0, resources: 0 },
      startingAge: 0,
    }
  }

  /** 获取当前基础属性（供其他子系统读取，如 HealthSystem 需要体魄） */
  getCurrent(): BaseAttributes {
    return { ...this.state.current }
  }

  // -------- 内部方法 --------

  private aggregateModifiers(context: RoundContext): void {
    const modifiers: AttributeModifiers = {
      physique: 0, mind: 0, talentAptitude: 0, charisma: 0, resources: 0,
    }

    // 物种基准线（想法2：超凡领域，current = speciesBaseline + 玩家分配 + modifiers）
    const lifespan = context.subsystemStates['lifespan']
    if (lifespan?.data) {
      const race = (lifespan.data as Record<string, unknown>).race as RaceLifespanConfig | undefined
      if (race?.attrBaselines) {
        for (const key of ['physique', 'mind', 'talentAptitude', 'charisma'] as const) {
          const baseline = race.attrBaselines[key]
          if (typeof baseline === 'number') {
            modifiers[key] += baseline
          }
        }
      }
    }

    // 命格修正
    const dp = context.subsystemStates['destiny-pattern']
    if (dp?.data) {
      const patterns = (dp.data as Record<string, unknown>).patterns as Array<{ attrBonus?: Partial<AttributeModifiers> }> | undefined
      if (patterns) {
        for (const p of patterns) {
          if (p.attrBonus) {
            for (const key of ['physique', 'mind', 'talentAptitude', 'charisma', 'resources'] as const) {
              if (typeof p.attrBonus[key] === 'number') {
                modifiers[key] += p.attrBonus[key]!
              }
            }
          }
        }
      }
    }

    // 伤病修正
    const health = context.subsystemStates['health']
    if (health?.data) {
      const diseases = (health.data as Record<string, unknown>).diseases as Array<{ attrEffects?: Partial<AttributeModifiers> }> | undefined
      const injuries = (health.data as Record<string, unknown>).injuries as Array<{ attrEffects?: Partial<AttributeModifiers> }> | undefined
      const allAffects = [...(diseases ?? []), ...(injuries ?? [])]
      for (const item of allAffects) {
        if (item.attrEffects) {
          for (const key of ['physique', 'mind', 'talentAptitude', 'charisma', 'resources'] as const) {
            if (typeof item.attrEffects[key] === 'number') {
              modifiers[key] += item.attrEffects[key]!
            }
          }
        }
      }
    }

    // 衰减修正
    const decay = context.subsystemStates['attribute-decay']
    if (decay?.data) {
      const dm = (decay.data as Record<string, unknown>).modifiers as Partial<AttributeModifiers> | undefined
      if (dm) {
        for (const key of ['physique', 'mind', 'talentAptitude', 'charisma'] as const) {
          if (typeof dm[key] === 'number') {
            modifiers[key] += dm[key]!
          }
        }
      }
    }

    for (const key of ['physique', 'mind', 'talentAptitude', 'charisma', 'resources'] as const) {
      modifiers[key] = round(modifiers[key])
    }

    this.state.modifiers = modifiers
  }

  /**
   * 分类钳制单个属性值。
   * 可超凡属性（体魄/心智/悟性/魅力）放开到 [-ATTR_HARD_CAP, ATTR_HARD_CAP]，
   * 凡人锁定属性（出身）保持 [-10, 10]。
   */
  private clampAttr(key: string, value: number): number {
    if ((TRANSCENDENT_ATTR_KEYS as readonly string[]).includes(key)) {
      return Math.max(-ATTR_HARD_CAP, Math.min(ATTR_HARD_CAP, value))
    }
    return Math.max(MIN_ATTRIBUTE_VALUE, Math.min(MAX_ATTRIBUTE_VALUE, value))
  }

  private recalculateCurrent(): void {
    for (const key of ['physique', 'mind', 'talentAptitude', 'charisma', 'resources'] as const) {
      this.state.current[key] = round(
        this.clampAttr(key, this.state.base[key] + this.state.modifiers[key])
      )
    }
  }

  private getAttrKeyLabel(key: string, value: number): string {
    const icons: Record<string, string> = {
      physique: '\u{1F4AA}', mind: '\u{1F9E0}', talentAptitude: '\u2B50', charisma: '\u{1F4AB}', resources: '\u{1F3E0}',
    }
    const names: Record<string, string> = {
      physique: '体魄', mind: '心智', talentAptitude: '悟性', charisma: '魅力', resources: '出身',
    }
    return `${icons[key] ?? ''}${names[key] ?? key}${value}`
  }

}
