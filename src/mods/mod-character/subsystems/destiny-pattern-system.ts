/**
 * Purpose: Own selected destiny patterns, candidates, rarity counts, and the public subsystem lifecycle.
 * Owner: mod-character
 * Responsibility: Mutate character-owned destiny state while delegating transient AI pool generation and value validation.
 */

import type { RoundContext, SubSystemState, SubSystemChanges } from '@/foundation'
import type { DestinyPattern, DestinyPatternInput, DestinyPatternRarity, DestinyPatternState } from '../types'
import { BaseSubsystem } from '@/core'

import {
  PRESET_DESTINY_PATTERNS,
  DESTINY_PATTERN_RARITY_WEIGHTS,
  DESTINY_PATTERN_RARITY_LIMITS,
  DESTINY_PATTERN_DISPLAY_COUNT,
  DESTINY_PATTERN_SELECT_COUNT,
  DESTINY_PATTERN_ID_PREFIX,
} from '../constants'

import type { BuildDestinyPatternContextInput } from '../prompts/destiny-pattern-context'
import { useCharacterStore } from '../store'
import { validatePatternSystemModifiers } from '../utils/destiny-pattern-modifiers'
import { sanitizeDestinyPatternState } from '../utils/character-state-migration'

export type {
  DestinyPatternAIGenerateOptions,
  DestinyPatternPoolFillStatus,
} from './destiny-pattern-system/contracts'
import type {
  DestinyPatternAIGenerateOptions,
  DestinyPatternAiCaller,
  DestinyPatternPoolFillStatus,
} from './destiny-pattern-system/contracts'
import { DestinyPatternAiPoolService } from './destiny-pattern-system/ai-pool-service'
import {
  getDestinyPatternRarityLabel,
  validateDestinyPatternAttrBonus,
  validateDestinyPatternPolarity,
  validateDestinyPatternRarity,
} from './destiny-pattern-system/validation'

export class DestinyPatternSystem extends BaseSubsystem {
  readonly id = 'destiny-pattern' as const
  readonly mod = 'mod-character' as const
  readonly label = '命格' as const
  readonly description = '管理角色命格池，支持抽12选3、首屏五条早交接 + AI 流式生成 + 内置预设双模式' as const

  private idCounter = 0

  private state: DestinyPatternState = {
    candidates: [],
    patterns: [],
    rarityCount: { common: 0, fine: 0, rare: 0, epic: 0, legendary: 0 },
  }

  private readonly aiPool = new DestinyPatternAiPoolService((patterns) => {
    this.state.candidates = patterns
  })

  collectState(context: RoundContext): SubSystemState {
    const s = this.state
    const rarityLines = Object.entries(s.rarityCount)
      .filter(([, count]) => count > 0)
      .map(([r, c]) => `${getDestinyPatternRarityLabel(r as DestinyPatternRarity)}×${c}`)
    const bonusSummary = this.summarizeAttrBonuses()

    return {
      id: this.id,
      summary: `【${this.label}】已持有 ${s.patterns.length} 条命格（${rarityLines.join(' ')}）${bonusSummary ? ' | 属性加成：' + bonusSummary : ''}`,
      data: structuredClone({
        contextId: context.contextId,
        candidates: s.candidates,
        patterns: s.patterns,
        rarityCount: s.rarityCount,
      }),
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    if (!changes || typeof changes !== 'object') return
    if (changes.id !== this.id) return
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) return
    if (!changes.description || changes.description.trim() === '') return

    const ch = changes.changes
    // 添加命格
    if (Array.isArray(ch.addPatterns)) {
      for (const p of ch.addPatterns as DestinyPattern[]) {
        this.addPattern(p)
      }
    }
    // 设置完整命格列表
    if (Array.isArray(ch.patterns)) {
      this.state.patterns = []
      this.state.rarityCount = { common: 0, fine: 0, rare: 0, epic: 0, legendary: 0 }
      for (const p of ch.patterns as DestinyPattern[]) {
        this.addPattern(p)
      }
    }
  }

  reset(): void {
    this.abortPoolFill()
    this.idCounter = 0
    this.state = {
      candidates: [],
      patterns: [],
      rarityCount: { common: 0, fine: 0, rare: 0, epic: 0, legendary: 0 },
    }
  }

  /** 将创建流程已确认的候选与命格写入运行时单例。 */
  hydrateFromStore(): void {
    this.restoreCollectedState(useCharacterStore.getState().destinyPatterns)
  }

  /** 从 orchestrator collectState().data 恢复命格运行态。 */
  restoreCollectedState(snapshot: unknown): void {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return
    this.state = sanitizeDestinyPatternState(snapshot)
    this.idCounter = Math.max(this.idCounter, this.state.candidates.length + this.state.patterns.length)
  }

  // -------- 公共方法 --------

  /** 内置模式：从预设池随机生成候选命格（展示 12 条，暂存 candidates，不直接写入 patterns） */
  generateFromPresets(count = DESTINY_PATTERN_DISPLAY_COUNT): DestinyPattern[] {
    const pool = PRESET_DESTINY_PATTERNS.filter((pattern) => pattern.polarity !== 'negative')
    const result: DestinyPattern[] = []

    // 加权随机抽取
    while (result.length < count && pool.length > 0) {
      const weighted = this.buildWeightedPool(pool, result)
      const idx = this.weightedRandomIndex(weighted)
      const template = weighted[idx]
      if (!template) continue

      const pattern: DestinyPattern = {
        id: `${DESTINY_PATTERN_ID_PREFIX.PRESET}-${this.idCounter++}`,
        ...template,
      }

      // 检查稀有度上限
      const limit = DESTINY_PATTERN_RARITY_LIMITS[pattern.rarity]
      const currentCount = result.filter((p) => p.rarity === pattern.rarity).length
      if (limit !== undefined && currentCount >= limit) {
        continue
      }

      result.push(pattern)
    }

    this.state.candidates = result
    return result
  }

  /**
   * 外部 AI 命格注入：校验传入的 AI 命格数据并追加到候选池
   *
   * 为 AI 生成的命格添加 'ai_' 前缀 ID 以区分预设命格。
   * 校验失败的条目会被静默跳过。
   */
  generateFromAI(aiGeneratedPatterns: DestinyPatternInput[]): DestinyPattern[] {
    const result: DestinyPattern[] = []

    for (const input of aiGeneratedPatterns) {
      const rarity = validateDestinyPatternRarity(input.rarity)
      const polarity = validateDestinyPatternPolarity(input.polarity)
      if (!rarity || !polarity) continue

      const pattern: DestinyPattern = {
        id: `ai_${this.idCounter++}`,
        name: input.name,
        description: input.description,
        rarity,
        polarity,
        effect: input.effects,
        attrBonus: input.attrBonus
          ? validateDestinyPatternAttrBonus(input.attrBonus as Record<string, number>, rarity)
          : {},
        systemModifiers: validatePatternSystemModifiers(input.systemModifiers, rarity),
      }

      result.push(pattern)
    }

    this.state.candidates.push(...result)
    return result
  }

  /** 后台命格池填充进度（与页面生命周期解耦） */
  getPoolFillStatus(): DestinyPatternPoolFillStatus {
    return this.aiPool.getPoolFillStatus()
  }

  /** 中止正在运行的后台池填充（页面离开或重新抽取时调用） */
  abortPoolFill(): void {
    this.aiPool.abortPoolFill()
  }

  /** 设置 AI 服务实例（由引擎初始化时注入） */
  setAIService(callAI: DestinyPatternAiCaller): void {
    this.aiPool.setAIService(callAI)
  }

  /**
   * AI 生成命格池（首屏三路并发、每路 10 条，随后后台续填至约 100 条）
   */
  async generateWithAI(
    contextInput: BuildDestinyPatternContextInput,
    onProgress?: (count: number, patterns: DestinyPattern[]) => void,
    onEarlyReady?: (patterns: DestinyPattern[]) => void,
    onBatchStart?: (batchIndex: number) => void,
    options?: DestinyPatternAIGenerateOptions,
  ): Promise<DestinyPattern[]> {
    return this.aiPool.generateWithAI(
      contextInput,
      onProgress,
      onEarlyReady,
      onBatchStart,
      options,
    )
  }

  /**
   * 从候选命格中选择指定 ID 的命格（选3，对齐废弃项目 validateTalentSelection）
   * 返回选中的命格数组，写入 state.patterns 并更新 rarityCount
   */
  selectPatterns(
    selectedIds: string[],
    candidatePool?: DestinyPattern[],
  ): DestinyPattern[] {
    if (selectedIds.length !== DESTINY_PATTERN_SELECT_COUNT) {
      throw new Error(`必须选择正好 ${DESTINY_PATTERN_SELECT_COUNT} 个命格（当前 ${selectedIds.length} 个）`)
    }

    const pool = candidatePool?.length ? candidatePool : this.state.candidates
    const idSet = new Set(selectedIds)
    const selected = pool.filter((p) => idSet.has(p.id))

    if (selected.length !== DESTINY_PATTERN_SELECT_COUNT) {
      const foundIds = new Set(selected.map((p) => p.id))
      const missing = selectedIds.filter((id) => !foundIds.has(id))
      throw new Error(`选择了无效的命格 ID: ${missing.join(', ')}`)
    }

    this.state.patterns = selected
    this.recountRarity()
    return selected
  }

  /** 清空候选命格列表（用于重新抽取） */
  clearCandidates(): void {
    this.state.candidates = []
  }

  /** 获取候选命格列表 */
  getCandidates(): DestinyPattern[] {
    return [...this.state.candidates]
  }

  /** 获取稀有度统计 */
  getRarityCount(): Record<DestinyPatternRarity, number> {
    return { ...this.state.rarityCount }
  }

  /** 获取命格列表 */
  getPatterns(): DestinyPattern[] {
    return [...this.state.patterns]
  }

  /** 获取命格属性加成汇总 */
  getAttrBonuses(): Partial<Record<string, number>> {
    const bonuses: Record<string, number> = {}
    for (const p of this.state.patterns) {
      if (p.attrBonus) {
        for (const [key, value] of Object.entries(p.attrBonus)) {
          if (typeof value === 'number') {
            bonuses[key] = (bonuses[key] ?? 0) + value
          }
        }
      }
    }
    return bonuses
  }

  // -------- 内部方法 --------

  private addPattern(pattern: DestinyPattern): void {
    this.state.patterns.push(pattern)
    this.state.rarityCount[pattern.rarity] = (this.state.rarityCount[pattern.rarity] ?? 0) + 1
  }

  private recountRarity(): void {
    this.state.rarityCount = { common: 0, fine: 0, rare: 0, epic: 0, legendary: 0 }
    for (const p of this.state.patterns) {
      this.state.rarityCount[p.rarity] = (this.state.rarityCount[p.rarity] ?? 0) + 1
    }
  }

  private buildWeightedPool(pool: typeof PRESET_DESTINY_PATTERNS, already: DestinyPattern[]): typeof PRESET_DESTINY_PATTERNS {
    return pool.filter((t) => {
      const limit = DESTINY_PATTERN_RARITY_LIMITS[t.rarity]
      if (limit === undefined) return true
      const current = already.filter((p) => p.rarity === t.rarity).length
      return current < limit
    })
  }

  private weightedRandomIndex(pool: typeof PRESET_DESTINY_PATTERNS): number {
    const weights = pool.map((t) => DESTINY_PATTERN_RARITY_WEIGHTS[t.rarity] ?? 10)
    const totalWeight = weights.reduce((a, b) => a + b, 0)
    let r = Math.random() * totalWeight
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i] ?? 0
      if (r <= 0) return i
    }
    return pool.length - 1
  }

  private summarizeAttrBonuses(): string {
    const bonuses = this.getAttrBonuses()
    const entries = Object.entries(bonuses).filter(([, v]) => v !== 0)
    if (entries.length === 0) return ''
    const names: Record<string, string> = {
      physique: '体魄', mind: '心智', talentAptitude: '悟性', charisma: '魅力',
    }
    return entries.map(([k, v]) => {
      const sign = (v ?? 0) > 0 ? '+' : ''
      return `${names[k] ?? k}${sign}${v}`
    }).join(' ')
  }

}

let runtimeDestinyPatternSystem: DestinyPatternSystem | undefined

/** 创建页与 loader 共用的懒加载运行时单例。 */
export function getDestinyPatternSystem(): DestinyPatternSystem {
  runtimeDestinyPatternSystem ??= new DestinyPatternSystem()
  return runtimeDestinyPatternSystem
}
