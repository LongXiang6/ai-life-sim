/**
 * @module EducationSystem
 * @description 教育子系统：识字率增长、知识积累、科研产出、教育普及度变化
 * @mod mod-culture
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { getRoundSequence, getAgeYearsDelta } from '@/foundation'

import { extractDynamicAttrsFromNarrative } from '@/foundation'

import type { AttrTagMap } from '@/foundation'
import type { EducationQuality, EducationState, EducationSystemType, EducationDirection } from '../types'

import {
  EDUCATION_SYSTEM_LABELS,
  EDUCATION_INSTITUTION_POOL,
  EDUCATION_QUALITY_LABELS,
  LITERACY_BY_CLASS_DEFAULT,
  WORLDVIEW_LITERACY_MAP,
  DEFAULT_EDUCATION_ACCESS,
  BASE_RESEARCH_OUTPUT,
  KNOWLEDGE_SPREAD_RATE_DEFAULT,
  KNOWLEDGE_SPREAD_BOOST_THRESHOLD,
  KNOWLEDGE_SPREAD_DECAY_THRESHOLD,
  KNOWLEDGE_SPREAD_BOOST_RATE,
  KNOWLEDGE_SPREAD_DECAY_RATE,
  EDUCATION_KNOWLEDGE_MOD,
  EDUCATION_INNOVATION_MOD,
  EDUCATION_LEVEL_LABELS,
  EDUCATION_DIRECTION_LABELS,
  round,
  clamp,
  pickRandom,
} from '../constants'

import { getFormulaModifier } from '@/mods/mod-world'

const EDUCATION_TAG_MAP: AttrTagMap = {
  '知识': 'knowledgeTotal', '学识': 'knowledgeTotal',
  '识字率': 'literacyRate', '读写率': 'literacyRate',
  '教育普及': 'educationAccess', '教育': 'educationAccess',
  '科研': 'researchOutput', '研究': 'researchOutput',
}

export class EducationSystem implements ISubSystem {
  readonly id = 'education' as const
  readonly mod = 'mod-culture' as const
  readonly label = '教育' as const
  readonly description = '管理教育制度类型、识字率增长、知识积累、科研产出与教育普及度' as const

  private state = this.createInitialState()
  private _lastProcessedRound = -1
  private _worldview = ''

  /** 设置世界观（影响初始分阶层识字率） */
  setWorldview(wv: string): void {
    this._worldview = wv
    this.state.worldview = wv
    // 如尚未推进过，更新初始识字率
    if (this._lastProcessedRound < 0) {
      const defaults = LITERACY_BY_CLASS_DEFAULT[WORLDVIEW_LITERACY_MAP[wv] ?? 'default'] ?? LITERACY_BY_CLASS_DEFAULT.default
      this.state.literacyByClass = { elite: defaults.elite, middle: defaults.middle, common: defaults.common }
      this.state.literacyRate = clamp(
        round(defaults.elite * 0.1 + defaults.middle * 0.2 + defaults.common * 0.7),
        0, 100,
      )
    }
  }

  private createInitialState(): EducationState {
    const defaults = this._worldview
      ? (LITERACY_BY_CLASS_DEFAULT[WORLDVIEW_LITERACY_MAP[this._worldview] ?? 'default'] ?? LITERACY_BY_CLASS_DEFAULT.default)
      : LITERACY_BY_CLASS_DEFAULT.default
    const initialRate = clamp(round(defaults.elite * 0.1 + defaults.middle * 0.2 + defaults.common * 0.7), 0, 100)
    return {
      systemType: 'private',
      institutions: [],
      knowledgeTotal: 0,
      literacyRate: initialRate,
      educationAccess: DEFAULT_EDUCATION_ACCESS,
      researchOutput: BASE_RESEARCH_OUTPUT,
      knowledgeSpreadRate: KNOWLEDGE_SPREAD_RATE_DEFAULT,
      educationDirection: 'general',
      educationLevel: 'none',
      literacyByClass: { elite: defaults.elite, middle: defaults.middle, common: defaults.common },
      worldview: this._worldview,
    }
  }

  collectState(context: RoundContext): SubSystemState {
    if (getRoundSequence(context) === this._lastProcessedRound) {
      return this.buildResult()
    }
    this._lastProcessedRound = getRoundSequence(context)

    const years = getAgeYearsDelta(context)
    if (years > 0) {
      this.advanceEducation(years)
    }

    return this.buildResult()
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

    // 设置教育制度类型
    if (typeof c.systemType === 'string') {
      const valid: EducationSystemType[] = ['private', 'public', 'religious', 'guild', 'academy']
      if (valid.includes(c.systemType as EducationSystemType)) {
        this.state.systemType = c.systemType as EducationSystemType
      }
    }

    // 添加教育机构
    if (Array.isArray(c.addInstitutions)) {
      for (const inst of c.addInstitutions as string[]) {
        if (typeof inst === 'string' && !this.state.institutions.includes(inst)) {
          this.state.institutions.push(inst)
        }
      }
    }

    // 删除教育机构
    if (Array.isArray(c.removeInstitutions)) {
      const removeSet = new Set(c.removeInstitutions as string[])
      this.state.institutions = this.state.institutions.filter((i) => !removeSet.has(i))
    }

    // 直接设置数值
    if (typeof c.knowledgeTotal === 'number') {
      this.state.knowledgeTotal = Math.max(0, c.knowledgeTotal)
    }
    if (typeof c.literacyRate === 'number') {
      this.state.literacyRate = clamp(c.literacyRate, 0, 100)
    }
    if (typeof c.literacyRateDelta === 'number') {
      this.state.literacyRate = clamp(this.state.literacyRate + (c.literacyRateDelta as number), 0, 100)
    }
    if (typeof c.educationAccess === 'number') {
      this.state.educationAccess = clamp(c.educationAccess, 0, 100)
    }
    if (typeof c.researchOutput === 'number') {
      this.state.researchOutput = Math.max(0, c.researchOutput)
    }

    // 增量操作
    if (typeof c.knowledgeDelta === 'number') {
      this.state.knowledgeTotal = round(Math.max(0, this.state.knowledgeTotal + c.knowledgeDelta))
    }

    // 设置分阶层识字率
    if (c.literacyByClass && typeof c.literacyByClass === 'object') {
      const lbc = c.literacyByClass as Record<string, unknown>
      if (typeof lbc.elite === 'number') this.state.literacyByClass.elite = clamp(lbc.elite, 0, 100)
      if (typeof lbc.middle === 'number') this.state.literacyByClass.middle = clamp(lbc.middle, 0, 100)
      if (typeof lbc.common === 'number') this.state.literacyByClass.common = clamp(lbc.common, 0, 100)
      this.state.literacyRate = clamp(
        round(this.state.literacyByClass.elite * 0.1 + this.state.literacyByClass.middle * 0.2 + this.state.literacyByClass.common * 0.7),
        0, 100,
      )
    }

    // 设置世界观
    if (typeof c.worldview === 'string') {
      this.state.worldview = c.worldview
      this._worldview = c.worldview
    }

    // 设置教育方向
    if (c.educationDirection && typeof c.educationDirection === 'string') {
      const dir = c.educationDirection as string
      const valid: EducationDirection[] = ['general', 'vocational', 'classical', 'scientific', 'mystical']
      if (valid.includes(dir as EducationDirection)) {
        this.state.educationDirection = dir as EducationDirection
      }
    }

    // P2 降级：AI JSON 未显式声明教育变化时，从 description 中补偿提取
    const hasExplicit = typeof c.systemType === 'string' || c.addInstitutions || c.removeInstitutions ||
      typeof c.knowledgeTotal === 'number' || typeof c.literacyRate === 'number' ||
      typeof c.educationAccess === 'number' || typeof c.researchOutput === 'number' ||
      typeof c.knowledgeDelta === 'number'
    if (!hasExplicit) {
      const extracted = extractDynamicAttrsFromNarrative(changes.description, EDUCATION_TAG_MAP)
      if (extracted) {
        if (typeof extracted.knowledgeTotal === 'number') {
          this.state.knowledgeTotal = Math.max(0, this.state.knowledgeTotal + extracted.knowledgeTotal)
        }
        if (typeof extracted.literacyRate === 'number') {
          this.state.literacyRate = clamp(this.state.literacyRate + extracted.literacyRate, 0, 100)
        }
        if (typeof extracted.educationAccess === 'number') {
          this.state.educationAccess = clamp(this.state.educationAccess + extracted.educationAccess, 0, 100)
        }
        if (typeof extracted.researchOutput === 'number') {
          this.state.researchOutput = Math.max(0, this.state.researchOutput + extracted.researchOutput)
        }
      }
    }
  }

  reset(): void {
    this.state = this.createInitialState()
    this._lastProcessedRound = -1
  }

  // ─── 内部推进逻辑 ───

  private advanceEducation(years: number): void {
    if (years <= 0) return
    const accessFactor = this.state.educationAccess / 100
    const institutionBonus = Math.min(this.state.institutions.length * 0.1, 0.5)
    const baseGrowth = (accessFactor * 0.15 + institutionBonus * 0.05)
      * getFormulaModifier('literacyGrowthModifier')

    // 1. 各阶层识字率增长（不同 catch-up rate，模拟教育不平等）
    const catchUpRates: Record<'elite' | 'middle' | 'common', number> = {
      elite: 1.0,
      middle: 0.8,
      common: 0.6,
    }
    for (const key of ['elite', 'middle', 'common'] as const) {
      const growth = baseGrowth * catchUpRates[key] * (1 - this.state.literacyByClass[key] / 100) * years
      this.state.literacyByClass[key] = clamp(round(this.state.literacyByClass[key] + growth), 0, 100)
    }

    // 2. 整体识字率 = 加权平均（精英10% / 中产20% / 平民70%）
    this.state.literacyRate = clamp(
      round(
        this.state.literacyByClass.elite * 0.1
        + this.state.literacyByClass.middle * 0.2
        + this.state.literacyByClass.common * 0.7,
      ),
      0, 100,
    )

    // 3. 教育普及度自然变化
    const accessDrift = (this.state.institutions.length * 0.2 - this.state.educationAccess * 0.01) * years
    this.state.educationAccess = clamp(round(this.state.educationAccess + accessDrift), 0, 100)

    // 4. 知识传播速率（废案逻辑：繁荣→提升，萧条→下降）
    const prosperity = this.state.literacyRate // 用识字率近似繁荣度
    if (prosperity > KNOWLEDGE_SPREAD_BOOST_THRESHOLD) {
      this.state.knowledgeSpreadRate = round(clamp(
        this.state.knowledgeSpreadRate + KNOWLEDGE_SPREAD_BOOST_RATE * years, 0, 0.5,
      ))
    } else if (prosperity < KNOWLEDGE_SPREAD_DECAY_THRESHOLD) {
      this.state.knowledgeSpreadRate = round(clamp(
        this.state.knowledgeSpreadRate - KNOWLEDGE_SPREAD_DECAY_RATE * years, 0, 0.5,
      ))
    }

    // 5. 知识积累：基于识字率、科研产出和知识传播速率
    const knowledgeGain = (this.state.literacyRate / 100) * this.state.researchOutput * 0.5
      * (1 + this.state.knowledgeSpreadRate) * years
    this.state.knowledgeTotal = round(this.state.knowledgeTotal + knowledgeGain)

    // 6. 科研产出：基于知识总量、教育机构、知识传播速率
    this.state.researchOutput = round(
      BASE_RESEARCH_OUTPUT + this.state.knowledgeTotal * 0.001
      + this.state.institutions.length * 0.2
      + this.state.knowledgeSpreadRate * 2,
    )

    // 7. 教育水平自动判定（基于整体识字率）
    if (this.state.literacyRate >= 80) this.state.educationLevel = 'advanced'
    else if (this.state.literacyRate >= 60) this.state.educationLevel = 'universal'
    else if (this.state.literacyRate >= 30) this.state.educationLevel = 'basic'
    else if (this.state.literacyRate >= 15) this.state.educationLevel = 'elite'
    else this.state.educationLevel = 'none'

    // 8. 随机新增教育机构
    if (this.state.institutions.length < 5 && Math.random() < 0.015 && this.state.educationAccess > 20) {
      const newInst = pickRandom(EDUCATION_INSTITUTION_POOL)
      if (!this.state.institutions.includes(newInst)) {
        this.state.institutions.push(newInst)
      }
    }
  }

  // ─── 领域方法 ───

  getSystemTypeLabel(): string {
    return EDUCATION_SYSTEM_LABELS[this.state.systemType] ?? '私塾'
  }

  getInstitutionCount(): number {
    return this.state.institutions.length
  }

  // ─── 教育质量 ───

  getEducationQuality(): EducationQuality {
    if (this.state.literacyRate >= 70) return 'excellent'
    if (this.state.literacyRate >= 40) return 'good'
    if (this.state.literacyRate >= 20) return 'adequate'
    return 'poor'
  }

  /** 获取知识获取乘数（教育水平→知识获取速度） */
  getEducationKnowledgeMod(): number {
    return EDUCATION_KNOWLEDGE_MOD[this.state.educationLevel] ?? 1.0
  }

  /** 获取科技革新乘数（教育水平→科技创新速度） */
  getEducationInnovationMod(): number {
    return EDUCATION_INNOVATION_MOD[this.state.educationLevel] ?? 1.0
  }

  /** 获取教育方向标签 */
  getEducationDirectionLabel(): string {
    return EDUCATION_DIRECTION_LABELS[this.state.educationDirection] ?? '通识'
  }

  /** 获取教育水平标签 */
  getEducationLevelLabel(): string {
    return EDUCATION_LEVEL_LABELS[this.state.educationLevel] ?? '未知'
  }

  /** 设置教育方向（AI 适配通道） */
  setEducationDirection(dir: EducationDirection): void {
    const valid: EducationDirection[] = ['general', 'vocational', 'classical', 'scientific', 'mystical']
    if (valid.includes(dir)) {
      this.state.educationDirection = dir
    }
  }

  // ─── 信息传播速度 ───

  getInformationSpeed(): number {
    // 基于识字率返回 0.5~2.0 的信息传播乘数
    return round(0.5 + (this.state.literacyRate / 100) * 1.5, 2)
  }

  // ─── AI Prompt 格式化输出 ───

  formatForPrompt(): string {
    const sysLabel = this.getSystemTypeLabel()
    const quality = this.getEducationQuality()
    const qualityLabel = EDUCATION_QUALITY_LABELS[quality]
    const dirLabel = this.getEducationDirectionLabel()
    const levelLabel = this.getEducationLevelLabel()
    return `【教育制度概况】
教育制度：${sysLabel}
教育水平：${levelLabel}（方向：${dirLabel}）
识字率：${this.state.literacyRate}%
  精英阶层：${this.state.literacyByClass.elite}%
  中产阶层：${this.state.literacyByClass.middle}%
  平民阶层：${this.state.literacyByClass.common}%
${qualityLabel}
教育普及度：${this.state.educationAccess}%
知识总量：${this.state.knowledgeTotal.toFixed(1)}
知识传播速率：${this.state.knowledgeSpreadRate.toFixed(3)}
知识获取乘数：×${this.getEducationKnowledgeMod().toFixed(2)}
科技革新乘数：×${this.getEducationInnovationMod().toFixed(2)}
科研产出：${this.state.researchOutput.toFixed(1)}
教育机构（${this.state.institutions.length}所）：${this.state.institutions.join('、') || '无'}
信息传播速度乘数：${this.getInformationSpeed().toFixed(2)}`
  }

  // ─── 摘要构建 ───

  private buildSummary(): string {
    const sysLabel = this.getSystemTypeLabel()
    const quality = this.getEducationQuality()
    const qualityLabel = EDUCATION_QUALITY_LABELS[quality]
    return `【${this.label}】体系: ${sysLabel}, 整体识字率: ${this.state.literacyRate}% (精英: ${this.state.literacyByClass.elite}%/中产: ${this.state.literacyByClass.middle}%/平民: ${this.state.literacyByClass.common}%), ${qualityLabel}, 知识总量: ${this.state.knowledgeTotal.toFixed(1)}, 机构: ${this.state.institutions.length}所`
  }

  private buildResult(): SubSystemState {
    const data = {
      ...structuredClone(this.state as unknown as Record<string, unknown>),
      innovationMod: this.getEducationInnovationMod(),
    }
    return { id: this.id, summary: this.buildSummary(), data }
  }
}
