/**
 * @module character-base-system.ts
 * @description 角色基础属性子系统
 * @mod mod-character
 */

import type { ISubSystem, RoundContext, SubSystemState, SubSystemChanges } from '@/foundation'
import type { BaseAttributes, AttributeModifiers, CharacterBaseState } from '../types'

import {
  MIN_ATTRIBUTE_VALUE,
  MAX_ATTRIBUTE_VALUE,
  ATTR_CN_ALIAS_TO_KEY,
  ATTR_INCREASE_KEYWORDS,
  ATTR_DECREASE_KEYWORDS,
  TRANSMIGRATOR_KEYWORDS,
} from '../constants'
import { round } from '../utils'

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
      lines.push(`${this.getAttrKeyLabel(key, base)}${modStr ? `(${modStr})` : ''}`)
    }

    return {
      id: this.id,
      summary: `【${this.label}】${lines.join(' / ')} | 起始年龄 ${s.startingAge}`,
      data: structuredClone({
        base: s.base,
        current: s.current,
        modifiers: s.modifiers,
        startingAge: s.startingAge,
      }),
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    if (!changes || typeof changes !== 'object') return
    if (changes.id !== this.id) return
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) return
    if (!changes.description || changes.description.trim() === '') return

    const ch = changes.changes

    // 背景文本：用于穿越者检测，自动设置起始年龄
    if (typeof ch.background === 'string') {
      this.state.startingAge = this.detectStartingAge(ch.background)
    }

    // 直接设置起始年龄（手动覆盖，优先级高于自动检测）
    if (typeof ch.startingAge === 'number') {
      this.state.startingAge = Math.max(0, ch.startingAge)
    }

    if (ch.base && typeof ch.base === 'object') {
      const b = ch.base as Partial<BaseAttributes>
      for (const key of ['physique', 'mind', 'talentAptitude', 'charisma', 'resources'] as const) {
        if (typeof b[key] === 'number') {
          this.state.base[key] = Math.max(MIN_ATTRIBUTE_VALUE, Math.min(MAX_ATTRIBUTE_VALUE, b[key]!))
        }
      }
    } else {
      // P2 降级：AI JSON 未显式声明 base 字段时，从 description 中补偿提取
      const extracted = this.parseAttrFromNarrative(changes.description)
      if (extracted) {
        for (const key of ['physique', 'mind', 'talentAptitude', 'charisma', 'resources'] as const) {
          if (typeof extracted[key] === 'number') {
            this.state.base[key] = Math.max(
              MIN_ATTRIBUTE_VALUE,
              Math.min(MAX_ATTRIBUTE_VALUE, this.state.base[key] + extracted[key]!)
            )
          }
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

  private recalculateCurrent(): void {
    for (const key of ['physique', 'mind', 'talentAptitude', 'charisma', 'resources'] as const) {
      this.state.current[key] = round(
        Math.max(
          MIN_ATTRIBUTE_VALUE,
          Math.min(MAX_ATTRIBUTE_VALUE, this.state.base[key] + this.state.modifiers[key])
        )
      )
    }
  }

  /**
   * P2 降级：从叙事文本中补偿提取属性变化
   * 三阶段正则流水线，复刻废案 parseAttrChangesFromText
   *
   * 阶段 1：严格格式 "属性名 +/-数字"（如"力量+3"、"智力-2"）
   * 阶段 2：自然语言增加 "属性名 提升/增加/增强 N点"（如"力量暴涨5点"）
   * 阶段 3：自然语言减少 "属性名 下降/减少/降低 N点"（如"智力衰退2点"）
   */
  parseAttrFromNarrative(narrative: string): Partial<Record<string, number>> | null {
    const result: Partial<Record<string, number>> = {}
    let found = false

    // 阶段 1：严格格式 "属性名 +/-数字"
    const strictRe = /([\u4e00-\u9fff]+)\s*([+-]\s*\d+)/g
    let m: RegExpExecArray | null
    while ((m = strictRe.exec(narrative)) !== null) {
      const key = ATTR_CN_ALIAS_TO_KEY[m[1]]
      if (key) {
        result[key] = (result[key] ?? 0) + parseInt(m[2].replace(/\s/g, ''), 10)
        found = true
      }
    }

    // 阶段 2：自然语言增加 "属性名 提升/增加/增强/上升/暴涨 N点"
    const incKeywords = ATTR_INCREASE_KEYWORDS.join('|')
    const incRe = new RegExp(
      `([\\u4e00-\\u9fff]+)\\s*(?:${incKeywords})\\s*(\\d+)\\s*点?`,
      'g'
    )
    while ((m = incRe.exec(narrative)) !== null) {
      const key = ATTR_CN_ALIAS_TO_KEY[m[1]]
      if (key) {
        result[key] = (result[key] ?? 0) + parseInt(m[2], 10)
        found = true
      }
    }

    // 阶段 3：自然语言减少 "属性名 下降/减少/降低/衰退/损失 N点"
    const decKeywords = ATTR_DECREASE_KEYWORDS.join('|')
    const decRe = new RegExp(
      `([\\u4e00-\\u9fff]+)\\s*(?:${decKeywords})\\s*(\\d+)\\s*点?`,
      'g'
    )
    while ((m = decRe.exec(narrative)) !== null) {
      const key = ATTR_CN_ALIAS_TO_KEY[m[1]]
      if (key) {
        result[key] = (result[key] ?? 0) - parseInt(m[2], 10)
        found = true
      }
    }

    return found ? result : null
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

  /**
   * 检测穿越者身份（对齐废弃项目 detectTransmigrator）
   * 13 个关键词：穿越/魂穿/重生/转世/夺舍/附身/觉醒/系统/绑定/降临/投影/异世界/魂越
   */
  private detectTransmigrator(background: string): boolean {
    if (!background) return false
    return TRANSMIGRATOR_KEYWORDS.some(kw => background.includes(kw))
  }

  /**
   * 检测起始年龄（对齐废弃项目 detectStartingAge）
   * - 穿越者默认 18 岁（带有前世记忆的成年人）
   * - 魂穿/魂越到婴儿/出生/降生场景的起始年龄为 0
   * - 原生者起始年龄为 0
   */
  private detectStartingAge(background: string): number {
    if (!background) return 0
    if (this.detectTransmigrator(background)) {
      // 魂穿/魂越到婴儿场景的特殊处理
      if (background.includes('魂穿') || background.includes('魂越')) {
        const infantMatch = background.match(/(?:魂穿|魂越).*?(?:婴儿|幼|0岁|出生|降生|转生)/)
        if (infantMatch) return 0
      }
      return 18
    }
    return 0
  }
}
