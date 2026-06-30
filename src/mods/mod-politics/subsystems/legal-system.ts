/**
 * @module LegalSystem
 * @description 法律子系统：法律体系演化、执法力度、腐败动态、叙事提示
 * @mod mod-politics
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { getRoundSequence, getAgeYearsDelta } from '@/foundation'

import { extractDynamicAttrsFromNarrative } from '@/foundation'

import type { AttrTagMap } from '@/foundation'
import type { LegalState, LawEntry, LawCategory, LegalSystemType } from '../types'

import {
  LAW_CATEGORY_LABELS,
  LEGAL_SYSTEM_LABELS,
  ENFORCEMENT_RANGE,
  LEGAL_EVOLVE_THRESHOLDS,
  LEGAL_NARRATIVE_HINTS,
  LEGAL_CORRUPTION_HINT_THRESHOLD,
  LEGAL_CORRUPTION_HINT,
  getEnforcementLabel,
  getEnforcementMultiplier,
  estimateCrimeRate,
  round,
  clamp,
} from '../constants'

import { getFormulaModifier } from '@/mods/mod-world'

const LEGAL_TAG_MAP: AttrTagMap = {
  '执法': 'enforcementLevel', '执法力度': 'enforcementLevel',
  '腐败': 'corruption', '贪污': 'corruption',
}

export class LegalSystem implements ISubSystem {
  readonly id = 'legal' as const
  readonly mod = 'mod-politics' as const
  readonly label = '法律' as const
  readonly description = '管理法律体系类型、法律条目、执法力度与腐败程度' as const

  private state = this.createInitialState()
  private _lastProcessedRound = -1

  private createInitialState(): LegalState {
    return {
      systemType: 'customary',
      laws: [],
      enforcementLevel: 50,
      corruption: 30,
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

    const years = getAgeYearsDelta(context)
    if (years > 0) {
      this.advanceLegal(years)
    }

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

    // 设置法律体系类型
    if (typeof c.systemType === 'string') {
      const valid: LegalSystemType[] = ['customary', 'statutory', 'religious', 'martial', 'anarchic']
      if (valid.includes(c.systemType as LegalSystemType)) {
        this.state.systemType = c.systemType as LegalSystemType
      }
    }

    // 添加法律条目
    if (Array.isArray(c.addLaws)) {
      for (const law of c.addLaws as Partial<LawEntry>[]) {
        if (law.id && law.name) {
          const idx = this.state.laws.findIndex((l) => l.id === law.id)
          if (idx >= 0) {
            this.state.laws[idx] = { ...this.state.laws[idx], ...law }
          } else {
            this.state.laws.push({
              id: law.id,
              name: law.name,
              category: law.category ?? 'civil',
              severity: clamp(law.severity ?? 50, 0, 100),
              active: law.active ?? true,
              punishment: law.punishment ?? '',
            })
          }
        }
      }
    }

    // 删除法律条目
    if (Array.isArray(c.removeLawIds)) {
      const removeIds = new Set(c.removeLawIds as string[])
      this.state.laws = this.state.laws.filter((l) => !removeIds.has(l.id))
    }

    // 设置执法力度
    if (typeof c.enforcementLevel === 'number') {
      this.state.enforcementLevel = clamp(c.enforcementLevel, ENFORCEMENT_RANGE.min, ENFORCEMENT_RANGE.max)
    }
    if (typeof c.enforcementDelta === 'number') {
      this.state.enforcementLevel = clamp(
        round(this.state.enforcementLevel + (c.enforcementDelta as number)),
        ENFORCEMENT_RANGE.min,
        ENFORCEMENT_RANGE.max,
      )
    }

    // 设置腐败程度
    if (typeof c.corruption === 'number') {
      this.state.corruption = clamp(c.corruption, 0, 100)
    }
    if (typeof c.corruptionDelta === 'number') {
      this.state.corruption = clamp(round(this.state.corruption + (c.corruptionDelta as number)), 0, 100)
    }

    // 设置法律启用/禁用
    if (typeof c.lawId === 'string' && typeof c.active === 'boolean') {
      const law = this.state.laws.find((l) => l.id === c.lawId)
      if (law) {
        law.active = c.active
      }
    }

    // P2 降级：AI JSON 未显式声明法律变化时，从 description 中补偿提取
    const hasExplicit = typeof c.systemType === 'string' || c.addLaws || c.removeLawIds ||
      typeof c.enforcementLevel === 'number' || typeof c.corruption === 'number' ||
      (typeof c.lawId === 'string' && typeof c.active === 'boolean')
    if (!hasExplicit) {
      const extracted = extractDynamicAttrsFromNarrative(changes.description, LEGAL_TAG_MAP)
      if (extracted) {
        if (typeof extracted.enforcementLevel === 'number') {
          this.state.enforcementLevel = clamp(this.state.enforcementLevel + extracted.enforcementLevel, ENFORCEMENT_RANGE.min, ENFORCEMENT_RANGE.max)
        }
        if (typeof extracted.corruption === 'number') {
          this.state.corruption = clamp(this.state.corruption + extracted.corruption, 0, 100)
        }
      }
    }
  }

  reset(): void {
    this.state = this.createInitialState()
    this._lastProcessedRound = -1
  }

  // ─── 内部推进逻辑 ───

  private advanceLegal(years: number): void {
    if (years <= 0) return
    const corruptionDrift = ((50 - this.state.enforcementLevel) / 100) * 0.5 * years
    this.state.corruption = clamp(round(this.state.corruption + corruptionDrift), 0, 100)

    const enforcementDrift = ((30 - this.state.corruption) / 100) * 0.3 * years
    this.state.enforcementLevel = clamp(
      round(this.state.enforcementLevel + enforcementDrift),
      ENFORCEMENT_RANGE.min,
      ENFORCEMENT_RANGE.max,
    )

    // 3. 法律体系类型演化（基于执法力度）
    this.evolveSystemType()

    // 4. 法律有效性检查
    for (const law of this.state.laws) {
      if (law.active && law.severity < 5 && this.state.corruption > 80) {
        law.active = false
      }
    }

    // 5. 随机新法律需求（法律数量少时）
    if (this.state.laws.filter((l) => l.active).length < 3 && Math.random() < 0.02 * years) {
      const categories: LawCategory[] = ['criminal', 'civil', 'commercial', 'religious', 'military']
      const cat = categories[Math.floor(Math.random() * categories.length)]
      const id = `law_${Date.now()}_${Math.floor(Math.random() * 10000)}`
      this.state.laws.push({
        id,
        name: `新${LAW_CATEGORY_LABELS[cat]}法${this.state.laws.length + 1}`,
        category: cat,
        severity: 30 + Math.floor(Math.random() * 50),
        active: true,
        punishment: '待定',
      })
    }
  }

  /** 法律体系状态机演化（基于执法力度） */
  private evolveSystemType(): void {
    const en = this.state.enforcementLevel
    const current = this.state.systemType

    // 崩溃检测：执法力度极低 → 无政府状态
    if (en < LEGAL_EVOLVE_THRESHOLDS.ANY_TO_ANARCHIC && current !== 'anarchic') {
      this.state.systemType = 'anarchic'
      return
    }

    // 军法检测：执法力度低且当前不是军法/无政府
    if (en < LEGAL_EVOLVE_THRESHOLDS.ANY_TO_MARTIAL && current !== 'martial' && current !== 'anarchic') {
      this.state.systemType = 'martial'
      return
    }

    // 无政府复苏：执法力度恢复 → 成文法
    if (current === 'anarchic' && en >= LEGAL_EVOLVE_THRESHOLDS.ANARCHIC_TO_STATUTORY) {
      this.state.systemType = 'statutory'
      return
    }

    // 军法回正：执法力度恢复 → 成文法
    if (current === 'martial' && en >= LEGAL_EVOLVE_THRESHOLDS.CUSTOMARY_TO_STATUTORY) {
      this.state.systemType = 'statutory'
      return
    }

    // 常规进化：习惯法 → 成文法
    if (current === 'customary' && en >= LEGAL_EVOLVE_THRESHOLDS.CUSTOMARY_TO_STATUTORY) {
      this.state.systemType = 'statutory'
      return
    }
  }

  // ─── 领域方法 ───

  getActiveLawCount(): number {
    return this.state.laws.filter((l) => l.active).length
  }

  getSystemTypeLabel(): string {
    return LEGAL_SYSTEM_LABELS[this.state.systemType] ?? '习惯法'
  }

  /** 获取执法乘数（0.3~1.5，影响经济效率） */
  getEnforcementMultiplier(): number {
    return getEnforcementMultiplier(this.state.enforcementLevel) * getFormulaModifier('legalEnforcementModifier')
  }

  /** 获取犯罪率估算 0-100 */
  getCrimeRate(): number {
    return estimateCrimeRate(this.state.corruption, this.state.enforcementLevel)
  }

  /** 格式化法律体系信息供 AI Prompt 使用 */
  formatForPrompt(): string {
    const lines: string[] = []

    // 体系类型 + 标签
    const sysLabel = this.getSystemTypeLabel()
    const enLabel = getEnforcementLabel(this.state.enforcementLevel)
    lines.push(`法律体系：${sysLabel}（执法力度${enLabel}：${this.state.enforcementLevel}，腐败度：${this.state.corruption}）`)

    // 叙事提示
    const hint = LEGAL_NARRATIVE_HINTS[this.state.systemType]
    if (hint) {
      lines.push(`描述：${hint}`)
    }

    // 高腐败额外提示
    if (this.state.corruption >= LEGAL_CORRUPTION_HINT_THRESHOLD) {
      lines.push(`警告：${LEGAL_CORRUPTION_HINT}`)
    }

    // 执法乘数 + 犯罪率
    const multiplier = this.getEnforcementMultiplier()
    const crimeRate = this.getCrimeRate()
    lines.push(`执法乘数：${multiplier.toFixed(2)}（影响合同执行与产权保护），犯罪率估算：${crimeRate}%`)

    // 活跃法律条文
    const activeLaws = this.state.laws.filter((l) => l.active)
    if (activeLaws.length > 0) {
      lines.push('现行法律：')
      for (const law of activeLaws) {
        lines.push(`  - ${law.name}（${LAW_CATEGORY_LABELS[law.category] ?? law.category}）[严厉度:${law.severity}]：${law.punishment}`)
      }
    }

    return lines.join('\n')
  }

  // ─── 摘要构建 ───

  private buildSummary(): string {
    const sysLabel = this.getSystemTypeLabel()
    const lawCount = this.getActiveLawCount()
    const multiplier = this.getEnforcementMultiplier()
    return `【${this.label}】体系: ${sysLabel}, 法律: ${lawCount}条, 执法: ${this.state.enforcementLevel}, 腐败: ${this.state.corruption}, 乘数: ${multiplier.toFixed(2)}`
  }
}
