/**
 * Purpose: Validate and apply persistent player base-attribute changes.
 * Owner: mod-character
 * Responsibility: Base attribute state, bounds, and semantic projections only; temporary modifiers stay downstream.
 *
 * @module character-base-system.ts
 * @description 角色基础属性子系统
 * @mod mod-character
 */

import type { RoundContext, SubSystemState, SubSystemChanges } from '@/foundation'
import type { BaseAttributes, AttributeModifiers, CharacterBaseState } from '../types'

import {
  MIN_ATTRIBUTE_VALUE,
  MAX_ATTRIBUTE_VALUE,
  ATTR_HARD_CAP,
  ATTR_KEYS,
  TRANSCENDENT_ATTR_KEYS,
} from '../constants'
import { round } from '../utils'
import { BaseSubsystem } from '@/core'
import { clamp, clampCharacterAttributeDelta } from '@/core/shared'
import { getAttrSemantic } from '../utils/attr-tiers'
import { useCharacterStore } from '../store'
import { sanitizeCharacterBaseState } from '../utils/character-state-migration'

export class CharacterBaseSystem extends BaseSubsystem {
  readonly id = 'character-base' as const
  readonly mod = 'mod-character' as const
  readonly label = '基础属性' as const
  readonly description = '管理从零起步、由叙事结构化修改的 4 项基础属性，并聚合种族、命格、生命周期、伤病与上下文修正' as const

  private state: CharacterBaseState = {
    base: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0 },
    current: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0 },
    modifiers: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0 },
    contextModifiers: {},
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
    for (const key of ATTR_KEYS) {
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
        contextId: context.contextId,
        base: s.base,
        current: s.current,
        modifiers: s.modifiers,
        contextModifiers: s.contextModifiers,
        startingAge: s.startingAge,
      }),
    }
  }

  /** Round 2 使用本轮其余子系统的最新快照重新聚合命格/种族等修正。 */
  collectStateUpdate(context: RoundContext): SubSystemState {
    return this.collectState(context)
  }

  applyChanges(changes: SubSystemChanges, context: RoundContext): void {
    if (!changes || typeof changes !== 'object') return
    if (changes.id !== this.id) return
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) return
    if (!changes.description || changes.description.trim() === '') return

    const ch = changes.changes

    // 起始年龄只接受显式结构化字段；自由背景文本不参与推断。
    if (typeof ch.startingAge === 'number') {
      this.state.startingAge = clamp(ch.startingAge, 0, Infinity)
    }

    // 主契约（P0）：扁平增量字段 physiqueDelta / mindDelta / talentAptitudeDelta /
    //   charismaDelta。单轮增量由 balance-config 按 daysPassed 缩放，
    //   叠加后再按属性类别（可超凡/凡人锁定）钳制最终值。
    for (const key of ATTR_KEYS) {
      const raw = ch[`${key}Delta`]
      if (typeof raw === 'number' && Number.isFinite(raw)) {
        const delta = clampCharacterAttributeDelta(raw, key, context.daysPassed)
        this.state.base[key] = round(this.clampAttr(key, this.state.base[key] + delta))
      }
    }

    // 兼容契约（P1）：嵌套 base 绝对值 { base: { physique: N } }（老格式/手动覆盖）
    if (ch.base && typeof ch.base === 'object') {
      const b = ch.base as Partial<BaseAttributes>
      for (const key of ATTR_KEYS) {
        if (typeof b[key] === 'number') {
          this.state.base[key] = round(this.clampAttr(key, b[key]!))
        }
      }
    }

    this.recalculateCurrent()
  }

  reset(): void {
    this.state = {
      base: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0 },
      current: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0 },
      modifiers: { physique: 0, mind: 0, talentAptitude: 0, charisma: 0 },
      contextModifiers: {},
      startingAge: 0,
    }
  }

  /** 从 UI Store 水合创建/刷新后的权威角色数据。 */
  hydrateFromStore(): void {
    this.restoreCollectedState(useCharacterStore.getState().characterBase)
  }

  /** 从 orchestrator 已持久化的 collectState().data 恢复私有运行态。 */
  restoreCollectedState(snapshot: unknown): void {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return
    this.state = sanitizeCharacterBaseState(snapshot)
  }

  /** 获取当前基础属性（供其他子系统读取，如 HealthSystem 需要体魄） */
  getCurrent(): BaseAttributes {
    return { ...this.state.current }
  }

  /** 生命周期初始化只读取该规范起始年龄，不从页面年龄或回合年份反推。 */
  getStartingAge(): number {
    return this.state.startingAge
  }

  setContextModifier(
    contextId: string,
    sourceId: string,
    modifiers: Partial<AttributeModifiers>,
  ): void {
    if (!contextId.trim() || !sourceId.trim()) throw new Error('上下文修正必须提供 contextId 和 sourceId')
    this.state.contextModifiers = {
      ...this.state.contextModifiers,
      [contextId]: {
        ...(this.state.contextModifiers[contextId] ?? {}),
        [sourceId]: structuredClone(modifiers),
      },
    }
  }

  clearContextModifier(contextId: string, sourceId: string): void {
    const sources = { ...(this.state.contextModifiers[contextId] ?? {}) }
    delete sources[sourceId]
    this.state.contextModifiers = { ...this.state.contextModifiers, [contextId]: sources }
  }

  // -------- 内部方法 --------

  private aggregateModifiers(context: RoundContext): void {
    const modifiers: AttributeModifiers = {
      physique: 0, mind: 0, talentAptitude: 0, charisma: 0,
    }

    // 物种基准线（current = 叙事基础值 + speciesBaseline + 其他 modifiers）
    const lifespan = context.subsystemStates['lifespan']
    if (lifespan?.data) {
      const profile = (lifespan.data as Record<string, unknown>).profile as {
        attrBaselines?: Partial<AttributeModifiers>
      } | undefined
      if (profile?.attrBaselines) {
        for (const key of ['physique', 'mind', 'talentAptitude', 'charisma'] as const) {
          const baseline = profile.attrBaselines[key]
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
            for (const key of ATTR_KEYS) {
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
      const conditions = (health.data as Record<string, unknown>).conditions as Array<{
        attributeModifiers?: Partial<AttributeModifiers>
      }> | undefined
      for (const item of conditions ?? []) {
        if (item.attributeModifiers) {
          for (const key of ATTR_KEYS) {
            if (typeof item.attributeModifiers[key] === 'number') {
              modifiers[key] += item.attributeModifiers[key]!
            }
          }
        }
      }
    }

    // 生命周期修正是当前阶段派生值，不按轮累计。
    const lifecycle = context.subsystemStates['lifecycle-system']
    if (lifecycle?.data) {
      const entity = (lifecycle.data as Record<string, unknown>).entity as {
        attributeModifiers?: Partial<AttributeModifiers>
      } | undefined
      if (entity?.attributeModifiers) {
        for (const key of ['physique', 'mind', 'talentAptitude', 'charisma'] as const) {
          if (typeof entity.attributeModifiers[key] === 'number') {
            modifiers[key] += entity.attributeModifiers[key]!
          }
        }
      }
    }

    // 当前上下文修正只在对应世界生效；切换后从零重新聚合，不会污染其他世界。
    for (const sourceModifiers of Object.values(this.state.contextModifiers[context.contextId] ?? {})) {
      for (const key of ATTR_KEYS) {
        const amount = sourceModifiers[key]
        if (typeof amount === 'number' && Number.isFinite(amount)) modifiers[key] += amount
      }
    }

    for (const key of ATTR_KEYS) {
      modifiers[key] = round(modifiers[key])
    }

    this.state.modifiers = modifiers
  }

  /**
   * 分类钳制单个属性值。
   * 可超凡属性（体魄/心智/悟性/魅力）放开到 [-ATTR_HARD_CAP, ATTR_HARD_CAP]。
   */
  private clampAttr(key: string, value: number): number {
    if ((TRANSCENDENT_ATTR_KEYS as readonly string[]).includes(key)) {
      return Math.max(-ATTR_HARD_CAP, Math.min(ATTR_HARD_CAP, value))
    }
    return Math.max(MIN_ATTRIBUTE_VALUE, Math.min(MAX_ATTRIBUTE_VALUE, value))
  }

  private recalculateCurrent(): void {
      for (const key of ATTR_KEYS) {
      this.state.current[key] = round(
        this.clampAttr(key, this.state.base[key] + this.state.modifiers[key])
      )
    }
  }

  private getAttrKeyLabel(key: string, value: number): string {
    const icons: Record<string, string> = {
      physique: '\u{1F4AA}', mind: '\u{1F9E0}', talentAptitude: '\u2B50', charisma: '\u{1F4AB}',
    }
    const names: Record<string, string> = {
      physique: '体魄', mind: '心智', talentAptitude: '悟性', charisma: '魅力',
    }
    return `${icons[key] ?? ''}${names[key] ?? key}${value}`
  }

}

let runtimeCharacterBaseSystem: CharacterBaseSystem | undefined

/** Loader 与页面共享的运行时单例；构造保持懒加载，避免模块求值副作用。 */
export function getCharacterBaseSystem(): CharacterBaseSystem {
  runtimeCharacterBaseSystem ??= new CharacterBaseSystem()
  return runtimeCharacterBaseSystem
}
