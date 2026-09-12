/**
 * Purpose: Own selected destiny patterns, candidates, rarity counts, and the public subsystem lifecycle.
 * Owner: mod-character
 * Responsibility: Mutate character-owned destiny state while delegating transient AI pool generation and value validation.
 */

import type { RoundContext, SubSystemState, SubSystemChanges } from '@/foundation'
import type {
  DestinyPattern,
  DestinyPatternGrowthHistoryEntry,
  PendingDestinyPatternGrowth,
  DestinyPatternInput,
  DestinyPatternRarity,
  DestinyPatternState,
} from '../types'
import { BaseSubsystem } from '@/core'

import {
  PRESET_DESTINY_PATTERNS,
  DESTINY_PATTERN_CATEGORY_ORDER,
  DESTINY_PATTERN_DISPLAY_COUNT,
  PATTERN_LOADOUT_SLOT_COUNT,
  DESTINY_PATTERN_ID_PREFIX,
  PRESET_DESTINY_PATTERN_CATEGORY_BY_NAME,
} from '../constants'

import type { BuildDestinyPatternContextInput } from '../prompts/destiny-pattern-context'
import { useCharacterStore } from '../store'
import { sanitizeDestinyPatternState } from '../utils/character-state-migration'
import {
  registerPendingDestinyPatternGrowthInState,
  resolvePendingDestinyPatternGrowthInState,
  withInitialDestinyPatternGrowthIdentity,
} from '../destiny-pattern-growth'

export type { DestinyPatternPoolFillStatus } from './destiny-pattern-system/contracts'
import type {
  DestinyPatternAiCaller,
  DestinyPatternPoolListener,
  DestinyPatternPoolFillStatus,
} from './destiny-pattern-system/contracts'
import { DestinyPatternAiPoolService } from './destiny-pattern-system/ai-pool-service'
import {
  dedupeDestinyPatterns,
  getDestinyPatternRarityLabel,
  validateDestinyPatternAttrBonus,
  validateDestinyPatternCategory,
} from './destiny-pattern-system/validation'

export class DestinyPatternSystem extends BaseSubsystem {
  readonly id = 'destiny-pattern' as const
  readonly mod = 'mod-character' as const
  readonly label = '命格' as const
  readonly description = '管理五类命格候选与选中结果，支持五路首批生成和分类后台补充' as const

  private idCounter = 0

  private state: DestinyPatternState = {
    candidates: [],
    patterns: [],
    rarityCount: { common: 0, fine: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 },
    pendingGrowth: null,
    growthHistory: [],
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
        pendingGrowth: s.pendingGrowth,
        growthHistory: s.growthHistory,
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
      this.state.rarityCount = { common: 0, fine: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 }
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
      rarityCount: { common: 0, fine: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 },
      pendingGrowth: null,
      growthHistory: [],
    }
  }

  /** 将创建流程已确认的候选与命格写入运行时单例。 */
  hydrateFromStore(): void {
    const store = useCharacterStore.getState()
    this.state = sanitizeDestinyPatternState(store.destinyPatterns, store.age)
    this.idCounter = Math.max(this.idCounter, this.state.candidates.length + this.state.patterns.length)
    useCharacterStore.setState({ destinyPatterns: structuredClone(this.state) })
  }

  /** 从 orchestrator collectState().data 恢复命格运行态。 */
  restoreCollectedState(snapshot: unknown): void {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return
    this.state = sanitizeDestinyPatternState(snapshot, useCharacterStore.getState().age)
    this.idCounter = Math.max(this.idCounter, this.state.candidates.length + this.state.patterns.length)
  }

  // -------- 公共方法 --------

  /** 内置模式：按与 AI 相同的五类首批配额生成普通候选。 */
  generateFromPresets(count = DESTINY_PATTERN_DISPLAY_COUNT): DestinyPattern[] {
    const assignments = DESTINY_PATTERN_CATEGORY_ORDER.flatMap((category) => (
      Array.from({ length: Math.ceil(count / DESTINY_PATTERN_CATEGORY_ORDER.length) }, () => category)
    )).slice(0, count)
    const result: DestinyPattern[] = []
    const usedNames = new Set<string>()
    for (const category of assignments) {
      const pool = PRESET_DESTINY_PATTERNS.filter((pattern) => (
        PRESET_DESTINY_PATTERN_CATEGORY_BY_NAME[pattern.name] === category
        && !usedNames.has(pattern.name)
      ))
      const template = pool[Math.floor(Math.random() * pool.length)]
      if (!template) throw new Error(`内置命格缺少 ${category} 分类候选`)
      usedNames.add(template.name)
      const id = `${DESTINY_PATTERN_ID_PREFIX.PRESET}-${this.idCounter++}`
      result.push(withInitialDestinyPatternGrowthIdentity({
        id,
        ...template,
        category,
        rarity: 'common',
      }, id))
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
      try {
        const category = validateDestinyPatternCategory(input.category)
        if (!category) continue
        const name = input.name.trim()
        const description = input.description.trim()
        const effect = input.effects.trim()
        if (!name || !description || !effect) continue

        const id = `ai_${this.idCounter++}`
        const pattern = withInitialDestinyPatternGrowthIdentity({
          id,
          name,
          description,
          category,
          rarity: 'common',
          effect,
          attrBonus: input.attrBonus
            ? validateDestinyPatternAttrBonus(input.attrBonus as Record<string, number>, 'common')
            : {},
        }, id)

        result.push(pattern)
      } catch {
        // 单条 AI 候选越界时丢弃整条候选，不截断或改写其属性。
      }
    }

    const existingIds = new Set(this.state.candidates.map((pattern) => pattern.id))
    this.state.candidates = dedupeDestinyPatterns([...this.state.candidates, ...result])
    return this.state.candidates.filter((pattern) => !existingIds.has(pattern.id))
  }

  /** 当前五类首批或后台补充请求状态。 */
  getPoolFillStatus(): DestinyPatternPoolFillStatus {
    return this.aiPool.getPoolFillStatus()
  }

  subscribePool(listener: DestinyPatternPoolListener): () => void {
    return this.aiPool.subscribe(listener)
  }

  /** 中止当前仍在运行的首批或后台补充请求；已接纳候选不会被清空。 */
  abortPoolFill(): void {
    this.aiPool.abortPoolFill()
  }

  /** 设置 AI 服务实例（由引擎初始化时注入） */
  setAIService(callAI: DestinyPatternAiCaller): void {
    this.aiPool.setAIService(callAI)
  }

  /** 将已有缓存候选恢复到命格池的瞬态运行状态。 */
  hydratePool(patterns: DestinyPattern[]): void {
    this.aiPool.hydratePool(patterns)
  }

  /** AI 五路并发生成首批分类命格候选。 */
  async generateWithAI(
    contextInput: BuildDestinyPatternContextInput,
  ): Promise<DestinyPattern[]> {
    return this.aiPool.generateWithAI(contextInput)
  }

  /** 进入选择页后按分类静默补充候选，直到每类达到目标数量。 */
  startBackgroundFill(
    contextInput?: BuildDestinyPatternContextInput,
    initialPatterns: DestinyPattern[] = [],
  ): Promise<DestinyPattern[]> {
    return this.aiPool.startBackgroundFill(contextInput, initialPatterns)
  }

  /** 从候选池提交占用共享携带槽的普通命格。 */
  selectPatterns(
    selectedIds: string[],
    candidatePool?: DestinyPattern[],
  ): DestinyPattern[] {
    if (selectedIds.length > PATTERN_LOADOUT_SLOT_COUNT) {
      throw new Error(`普通命格不能超过 ${PATTERN_LOADOUT_SLOT_COUNT} 个（当前 ${selectedIds.length} 个）`)
    }
    if (new Set(selectedIds).size !== selectedIds.length) {
      throw new Error('普通命格选择包含重复项')
    }

    const pool = candidatePool?.length ? candidatePool : this.state.candidates
    const idSet = new Set(selectedIds)
    const selected = pool.filter((p) => idSet.has(p.id))

    if (selected.length !== selectedIds.length) {
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

  registerPendingGrowth(pending: PendingDestinyPatternGrowth): void {
    this.state = registerPendingDestinyPatternGrowthInState(
      this.state,
      pending,
      useCharacterStore.getState().age,
    )
  }

  resolvePendingGrowth(optionId: string, committedAt = Date.now(), totalBasePoints = 0): DestinyPatternGrowthHistoryEntry {
    const resolved = resolvePendingDestinyPatternGrowthInState(this.state, optionId, committedAt, totalBasePoints)
    this.state = resolved.state
    return resolved.historyEntry
  }

  getStateSnapshot(): DestinyPatternState {
    return structuredClone(this.state)
  }

  captureTransactionState(): DestinyPatternState {
    return this.getStateSnapshot()
  }

  restoreTransactionState(snapshot: unknown): void {
    this.state = sanitizeDestinyPatternState(snapshot, useCharacterStore.getState().age)
    useCharacterStore.setState({ destinyPatterns: structuredClone(this.state) })
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
    this.state.rarityCount = { common: 0, fine: 0, rare: 0, epic: 0, legendary: 0, mythic: 0 }
    for (const p of this.state.patterns) {
      this.state.rarityCount[p.rarity] = (this.state.rarityCount[p.rarity] ?? 0) + 1
    }
  }

  private summarizeAttrBonuses(): string {
    const bonuses = this.getAttrBonuses()
    const entries = Object.entries(bonuses).filter(([, v]) => v !== 0)
    if (entries.length === 0) return ''
    const names: Record<string, string> = {
      mind: '心智', physique: '体魄', charisma: '魅力', familyBackground: '家境',
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
