/**
 * @module ConflictCycleSystem
 * @description 冲突周期子系统（可选）：六阶段冲突推进、对手系统、戏剧张力与打脸回报循环
 * @mod mod-politics
 *
 * 注意：本子系统为 OPTIONAL。当 state.enabled === false 时，
 * collectState 返回空摘要并跳过所有计算逻辑。
 */

import type { ISubSystem, SubSystemState, SubSystemChanges, RoundContext } from '@/foundation'
import { getRoundSequence, getAgeYearsDelta } from '@/foundation'
import type { ConflictCycleState, ConflictPhase, ConflictEvent, AntagonistProfile } from '../types'

import {
  CONFLICT_PHASE_ORDER,
  CONFLICT_PHASE_LABELS,
  CONFLICT_PHASE_DURATION,
  CONFLICT_THEME_POOL,
  ANTAGONIST_ARCHETYPES,
  ANTAGONIST_TYPE_LABELS,
  ANTAGONIST_NAMES,
  round,
  clamp,
  pickRandom,
} from '../constants'

import { getFormulaModifier } from '@/mods/mod-world'
import { useWorldStore } from '@/mods/mod-world'

/** 默认启用 conflict-cycle 的世界观（戏剧冲突向） */
const CONFLICT_CYCLE_DEFAULT_ESSENCES = new Set([
  'cultivation',
  'easternFantasy',
  'wuxia',
  'westernFantasy',
  'historical',
  'darkFantasy',
  'mythological',
  'lovecraftian',
])

/** 对手 ID 计数器 */
let _antagonistIdCounter = 0

/** 生成唯一对手 ID */
function nextAntagonistId(): string {
  _antagonistIdCounter++
  return `antagonist_${_antagonistIdCounter}`
}

/** 获取对手类型对应的中文标签 */
function getTypeLabel(type: string): string {
  return ANTAGONIST_TYPE_LABELS[type] ?? type
}

export class ConflictCycleSystem implements ISubSystem {
  readonly id = 'conflict-cycle' as const
  readonly mod = 'mod-politics' as const
  readonly label = '冲突周期' as const
  readonly description = '管理六阶段冲突推进、对手系统与戏剧张力（可选子系统）' as const

  private state: ConflictCycleState = this.createInitialState()
  private _lastProcessedRound = -1
  private _simYearAccumulator = 0
  private _autoEnableResolved = false
  private _explicitlyDisabled = false

  private createInitialState(): ConflictCycleState {
    return {
      enabled: false,
      currentPhase: 'peace',
      phaseProgress: 0,
      history: [],
      currentTheme: '',
      tension: 0,
      comboCount: 0,
      pendingHumiliation: 0,
      antagonist: null,
      antagonistPool: [],
    }
  }

  /** 首次运行时：戏剧向 essence 或已校准 conflictEscalation 时默认启用 */
  private maybeAutoEnable(): void {
    if (this._autoEnableResolved || this._explicitlyDisabled || this.state.enabled) {
      this._autoEnableResolved = true
      return
    }
    this._autoEnableResolved = true

    const essence = useWorldStore.getState().calibration?.metadata?.essenceTag ?? ''
    const escalationMod = getFormulaModifier('conflictEscalationModifier')
    if (CONFLICT_CYCLE_DEFAULT_ESSENCES.has(essence) || escalationMod !== 1) {
      this.state.enabled = true
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

    this.maybeAutoEnable()

    // 未启用时跳过计算
    if (!this.state.enabled) {
      return {
        id: this.id,
        summary: '',
        data: structuredClone(this.state as unknown as Record<string, unknown>),
      }
    }

    // 每轮自动推进
    this.advanceConflictCycle(context)

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

    // 启用/禁用
    if (typeof c.enabled === 'boolean') {
      this.state.enabled = c.enabled
      if (!c.enabled) {
        this._explicitlyDisabled = true
      } else {
        this._explicitlyDisabled = false
      }
      if (c.enabled) {
        if (!this.state.currentTheme) {
          this.state.currentTheme = pickRandom(CONFLICT_THEME_POOL)
        }
      }
    }

    // 直接设置阶段
    if (typeof c.currentPhase === 'string') {
      this.state.currentPhase = c.currentPhase as ConflictPhase
    }

    // 调整阶段进度
    if (typeof c.phaseProgress === 'number') {
      this.state.phaseProgress = clamp(c.phaseProgress, 0, 100)
    }

    // 设置冲突主题
    if (typeof c.currentTheme === 'string') {
      this.state.currentTheme = c.currentTheme
    }

    // 添加冲突事件
    if (c.conflictEvent && typeof c.conflictEvent === 'object') {
      this.state.history.push(c.conflictEvent as ConflictEvent)
    }

    // 直接设置状态（AI 适配）
    if (c.history && Array.isArray(c.history)) {
      this.state.history = c.history as ConflictEvent[]
    }

    // 设置张力
    if (typeof c.tension === 'number') {
      this.state.tension = clamp(c.tension, 0, 100)
    }
    if (typeof c.tensionDelta === 'number') {
      this.state.tension = clamp(round(this.state.tension + (c.tensionDelta as number)), 0, 100)
    }

    // 设置耻辱
    if (typeof c.pendingHumiliation === 'number') {
      this.state.pendingHumiliation = clamp(c.pendingHumiliation, 0, 1000)
    }

    // 生成新对手
    if (c.adaptationType === 'generate-antagonist' && typeof c.protagonistPower === 'number') {
      const newAntagonist = this.generateAntagonist(
        typeof c.antagonistType === 'string' ? c.antagonistType : undefined,
        c.protagonistPower as number,
      )
      this.state.antagonist = newAntagonist
      const existingIdx = this.state.antagonistPool.findIndex((a) => a.id === newAntagonist.id)
      if (existingIdx >= 0) {
        this.state.antagonistPool[existingIdx] = newAntagonist
      } else {
        this.state.antagonistPool.push(newAntagonist)
      }
    }
  }

  // ─── 内部推进逻辑 ───

  private advanceConflictCycle(context: RoundContext): void {
    const years = getAgeYearsDelta(context)
    if (years <= 0) return

    this._simYearAccumulator += years
    while (this._simYearAccumulator >= 1) {
      this._advanceConflictOneYear(context)
      this._simYearAccumulator -= 1
    }

    if (years < 1) {
      const phaseDuration = CONFLICT_PHASE_DURATION[this.state.currentPhase]
      const progressPerYear = round(100 / phaseDuration)
      this.state.phaseProgress = clamp(
        this.state.phaseProgress + progressPerYear * years,
        0,
        100,
      )
    }
  }

  private _advanceConflictOneYear(context: RoundContext): void {
    // ── 张力演进 ──
    this.advanceTension()

    // ── 阶段推进 ──
    const phaseDuration = CONFLICT_PHASE_DURATION[this.state.currentPhase]
    const progressPerYear = round(100 / phaseDuration)
    this.state.phaseProgress = clamp(
      this.state.phaseProgress + progressPerYear,
      0,
      100,
    )

    // 阶段推进检测
    if (this.state.phaseProgress >= 100) {
      this.advancePhase()

      // 生成冲突事件
      this.generateConflictEvent(context.round.year)

      // 非 peace 阶段且无活跃对手时生成对手
      if (this.state.currentPhase !== 'peace' && !this.state.antagonist) {
        const existing = this.state.antagonistPool.find((a) => a.status === 'active')
        if (existing) {
          this.state.antagonist = existing
        } else {
          this.state.antagonist = this.generateAntagonist(undefined, 50)
          this.state.antagonistPool.push(this.state.antagonist)
        }
      }
    }

    // ── climax 阶段打脸结算 ──
    if (this.state.currentPhase === 'climax' && this.state.antagonist && this.state.antagonist.status === 'active') {
      this.resolveFaceSlap()
    }
  }

  private advanceTension(): void {
    const phase = this.state.currentPhase
    // 不同阶段的张力自然变化
    switch (phase) {
      case 'peace':
        // 和平时期张力自然衰减
        this.state.tension = clamp(round(this.state.tension - 5), 0, 100)
        break
      case 'tension':
        // 暗流涌动：张力缓慢积累
        this.state.tension = clamp(round(this.state.tension + 3), 0, 100)
        break
      case 'escalation':
        // 黑云压城：快速积累
        this.state.tension = clamp(round(this.state.tension + 10), 0, 100)
        break
      case 'crisis':
        // 绝地反击：继续积累
        this.state.tension = clamp(round(this.state.tension + 8), 0, 100)
        break
      case 'climax':
        // 酣畅打脸：张力释放
        this.state.tension = clamp(round(this.state.tension - 15), 0, 100)
        break
      case 'resolution':
        // 余波未平：缓慢衰减
        this.state.tension = clamp(round(this.state.tension - 3), 0, 100)
        break
    }
  }

  private advancePhase(): void {
    const currentIdx = CONFLICT_PHASE_ORDER.indexOf(this.state.currentPhase)
    const nextIdx = (currentIdx + 1) % CONFLICT_PHASE_ORDER.length
    this.state.currentPhase = CONFLICT_PHASE_ORDER[nextIdx]
    this.state.phaseProgress = 0

    // resolution → peace 时换主题 + 降低连击
    if (this.state.currentPhase === 'peace') {
      this.state.currentTheme = pickRandom(CONFLICT_THEME_POOL)
      this.state.comboCount = 0
      // peace 时清除当前对手
      this.state.antagonist = null
    }
  }

  private generateConflictEvent(year: number): void {
    const severityMap: Record<ConflictPhase, number> = {
      peace: 5,
      tension: 20,
      escalation: 40,
      crisis: 65,
      climax: 80,
      resolution: 30,
    }

    const escalationMod = getFormulaModifier('conflictEscalationModifier')
    const eventChance: Record<ConflictPhase, number> = {
      peace: Math.min(1, 0.05 * escalationMod),
      tension: Math.min(1, 0.3 * escalationMod),
      escalation: Math.min(1, 0.5 * escalationMod),
      crisis: Math.min(1, 0.7 * escalationMod),
      climax: Math.min(1, 1.0 * escalationMod),
      resolution: Math.min(1, 0.4 * escalationMod),
    }

    if (Math.random() < eventChance[this.state.currentPhase]) {
      const baseSeverity = severityMap[this.state.currentPhase]
      const severity = baseSeverity + Math.floor(Math.random() * 20)

      const parties: string[] = ['我方势力']
      if (this.state.currentPhase !== 'peace' && this.state.antagonist) {
        parties.push(this.state.antagonist.name)
      } else if (this.state.currentPhase !== 'peace') {
        const opponentPool = ['邻国', '叛军', '土匪', '异族', '异教徒', '商业对手']
        parties.push(pickRandom(opponentPool))
      }

      const event: ConflictEvent = {
        phase: this.state.currentPhase,
        description: this.generateEventDescription(),
        parties,
        severity: clamp(severity, 0, 100),
        year,
      }

      this.state.history.push(event)

      // 仅保留最近 20 条历史
      if (this.state.history.length > 20) {
        this.state.history = this.state.history.slice(-20)
      }
    }
  }

  private generateEventDescription(): string {
    const phase = this.state.currentPhase
    const theme = this.state.currentTheme || '冲突'
    const ant = this.state.antagonist

    // 如果有对手，优先使用对手相关描述
    if (ant && phase !== 'peace') {
      const keyword = pickRandom(ant.actionKeywords)
      const typeLabel = getTypeLabel(ant.type)
      const tensionDesc = this.state.tension > 60 ? '局势剑拔弩张，' : ''
      switch (phase) {
        case 'tension':
          return `${tensionDesc}${ant.name}（${typeLabel}）${keyword}，围绕${theme}的矛盾日渐尖锐`
        case 'escalation':
          return `${tensionDesc}${ant.name}（${typeLabel}）${keyword}，${theme}相关冲突全面升级`
        case 'crisis':
          return `${tensionDesc}${ant.name}（${typeLabel}）${keyword}，局势危在旦夕`
        case 'climax':
          return `与${ant.name}（${typeLabel}）的较量达到高潮，决定性时刻到来`
        case 'resolution':
          return `与${ant.name}的冲突趋于平息，${theme}问题进入善后阶段`
      }
    }

    // 无对手时的通用描述
    const templates: Record<ConflictPhase, string[]> = {
      peace: [
        `外交使节团就${theme}与各方进行磋商`,
        `${theme}相关的条约谈判顺利推进`,
      ],
      tension: [
        `${theme}导致紧张局势加剧，边境出现小规模摩擦`,
        `各方围绕${theme}的利益分歧逐渐公开化`,
      ],
      escalation: [
        `${theme}冲突升级，双方开始动员力量`,
        `${theme}问题引发全面对峙，贸易中断`,
      ],
      crisis: [
        `${theme}危机爆发，全面冲突一触即发`,
        `围绕${theme}的谈判破裂，局势失控`,
      ],
      climax: [
        `${theme}爆发决定性对决，胜负在此一举`,
        `${theme}冲突达到顶点，大规模对抗展开`,
      ],
      resolution: [
        `${theme}冲突进入收尾阶段，双方开始谈判`,
        `战后秩序重建，${theme}问题得到阶段性解决`,
      ],
    }

    const pool = templates[phase] ?? [`${theme}相关事件`]
    return pickRandom(pool)
  }

  /** 打脸结算：反击成功后计算回报 */
  private resolveFaceSlap(): void {
    const ant = this.state.antagonist
    if (!ant) return

    this.state.comboCount++
    const combo = this.state.comboCount
    const multiplier = 1 + combo * 0.3
    const reputationGain = Math.floor(5 * multiplier)
    const moraleBoost = Math.floor(5 * multiplier * 0.5)

    // 连击≥3 时对手可被摧毁
    if (combo >= 3 && Math.random() < 0.3 + combo * 0.05) {
      ant.status = 'destroyed'
      // 摧毁时 从原型的 persistenceBase 判定卷土重来概率
      const archetype = ANTAGONIST_ARCHETYPES[ant.type]
      if (archetype && Math.random() < archetype.persistenceBase / 200) {
        // 保留在池中可能卷土重来
        ant.status = 'defeated'
        ant.comboCount = 0
      }
    } else {
      ant.status = 'defeated'
    }

    // 耻辱清零
    this.state.pendingHumiliation = 0

    // 记录冲突事件
    const slapEvent: ConflictEvent = {
      phase: 'climax',
      description: `【${combo >= 5 ? '五连绝世！' : combo >= 3 ? '完美反击！' : '打脸成功！'}】${ant.name}被彻底压制，我方获得 ${reputationGain} 声望 + ${moraleBoost} 士气`,
      parties: ['我方势力', ant.name],
      severity: 80 + Math.min(combo * 3, 20),
      year: this._lastProcessedRound > 0 ? this._lastProcessedRound : 0,
    }
    this.state.history.push(slapEvent)

    // 生成新对手（卷土重来或新角色）
    if (this.state.antagonistPool.filter((a) => a.status === 'active').length === 0) {
      // 找池中被挫败的可回归对手
      const returning = this.state.antagonistPool.find(
        (a) => a.status === 'defeated' && Math.random() < 0.3,
      )
      if (returning) {
        returning.status = 'active'
        this.state.antagonist = returning
      }
    }
  }

  // ─── 领域方法 ───

  /** 生成对手 */
  generateAntagonist(type?: string, protagonistPowerLevel = 50): AntagonistProfile {
    const types = Object.keys(ANTAGONIST_ARCHETYPES)
    const selectedType = type && types.includes(type) ? type : pickRandom(types)
    const archetype = ANTAGONIST_ARCHETYPES[selectedType]
    const names = ANTAGONIST_NAMES[selectedType] ?? ['无名氏']

    // 对手姓名去重（在池中查找未使用过的）
    const usedNames = new Set(this.state.antagonistPool.map((a) => a.name))
    const availableNames = names.filter((n) => !usedNames.has(n))
    const name = availableNames.length > 0 ? pickRandom(availableNames) : pickRandom(names)

    return {
      id: nextAntagonistId(),
      name,
      type: selectedType,
      power: Math.round(protagonistPowerLevel * 0.7 + Math.random() * 10 - 5),
      pride: archetype.prideBase + Math.floor(Math.random() * 10 - 5),
      persistence: archetype.persistenceBase + Math.floor(Math.random() * 10 - 5),
      status: 'active',
      actionKeywords: [...archetype.actionKeywords],
      comboCount: 0,
    }
  }

  /** 是否启用 */
  isEnabled(): boolean {
    return this.state.enabled
  }

  /** 获取当前阶段 */
  getCurrentPhase(): ConflictPhase {
    return this.state.currentPhase
  }

  /** 获取阶段进度 */
  getPhaseProgress(): number {
    return this.state.phaseProgress
  }

  /** 获取冲突历史 */
  getHistory(): ConflictEvent[] {
    return this.state.history
  }

  /** 获取当前冲突主题 */
  getCurrentTheme(): string {
    return this.state.currentTheme
  }

  /** 获取当前对手 */
  getCurrentAntagonist(): AntagonistProfile | null {
    return this.state.antagonist
  }

  /** 获取戏剧张力等级标签 */
  getTensionLevel(): string {
    const t = this.state.tension
    if (this.state.currentPhase === 'climax') return '高潮'
    if (t >= 80) return '高'
    if (t >= 60) return '中高'
    if (t >= 40) return '中'
    if (t >= 20) return '低'
    return '极低'
  }

  formatForPrompt(): string {
    const lines: string[] = []
    if (!this.state.enabled) {
      lines.push('【冲突状态】未启用')
      return lines.join('\n')
    }

    const phaseLabel = CONFLICT_PHASE_LABELS[this.state.currentPhase] ?? this.state.currentPhase
    const tensionLevel = this.getTensionLevel()
    lines.push(`【冲突状态】${phaseLabel}`)
    lines.push(`戏剧张力：${this.state.tension}（${tensionLevel}）`)
    lines.push(`主题：${this.state.currentTheme || '无'}`)
    lines.push('')

    // 对手信息
    if (this.state.antagonist && this.state.antagonist.status === 'active') {
      const ant = this.state.antagonist
      const typeLabel = getTypeLabel(ant.type)
      const keywords = ant.actionKeywords.join('、')
      lines.push('当前对手：')
      lines.push(`  姓名：${ant.name}`)
      lines.push(`  类型：${typeLabel}`)
      lines.push(`  实力：${ant.power}`)
      lines.push(`  嚣张度：${ant.pride}`)
      lines.push(`  威胁：${ant.persistence}`)
      lines.push(`  行为特征：${keywords}`)
    } else if (this.state.antagonist) {
      lines.push(`已挫败对手：${this.state.antagonist.name}`)
    }
    lines.push('')

    // 战斗统计
    if (this.state.comboCount > 0) {
      lines.push(`连击：${this.state.comboCount} 次`)
    }
    if (this.state.pendingHumiliation > 0) {
      lines.push(`累积耻辱：${this.state.pendingHumiliation}（尚需反击）`)
    }
    const defeatedCount = this.state.antagonistPool.filter((a) => a.status === 'defeated' || a.status === 'destroyed').length
    if (defeatedCount > 0) {
      lines.push(`已挫败对手数：${defeatedCount}`)
    }
    lines.push('')

    // 近期冲突事件
    if (this.state.history.length > 0) {
      const recent = this.state.history.slice(-3)
      lines.push('近期冲突事件：')
      for (const evt of recent) {
        lines.push(`  · [${evt.year}年] ${evt.description}`)
      }
    }

    return lines.join('\n')
  }

  private getSummaryText(): string {
    if (!this.state.enabled) return ''
    const phaseLabel = CONFLICT_PHASE_LABELS[this.state.currentPhase] ?? this.state.currentPhase
    const antName = this.state.antagonist?.name ?? '无对手'
    return `【${this.label}】${phaseLabel}, 张力: ${this.state.tension}, 对手: ${antName}`
  }

  reset(): void {
    this.state = this.createInitialState()
    this._lastProcessedRound = -1
    this._autoEnableResolved = false
    this._explicitlyDisabled = false
  }
}
