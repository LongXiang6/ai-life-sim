/**
 * @module subsystem-relevance-system.ts
 * @description 子系统相关性过滤 + 非破坏性近期窗口 —— 五维过滤（年龄/阶层/势力/影响力/始终相关）
 * @mod mod-engine
 *
 * 设计理念：传递给 AI 的数据 = 不可变信息 + 叙事故事 + 部分系统数据
 * - 完整保存系统状态与变更记录；Prompt 可选取最近 3 轮变化，但不得删除旧记录
 * - 根据角色年龄/阶层/势力/影响力等判断哪些系统数据需要传入 Prompt
 *
 * 五维过滤：
 *   1. 年龄过滤：根据角色年龄决定哪些系统相关
 *   2. 阶层过滤：根据社会阶层决定哪些系统相关
 *   3. 势力过滤：根据所属势力决定哪些系统相关
 *   4. 影响力过滤：根据当前世界力量框架的相对进度决定叙事因果影响范围
 *   5. 始终相关：某些系统始终需要（如健康、寿命）
 *
 * 影响力维度不使用跨世界固定阶位。力量系统只在本世界框架内计算相对进度，
 * 再将相对进度映射到叙事作用范围。
 */

import type { ISubSystem, RoundContext, SubSystemState, SubSystemChanges, } from '@/foundation'

// ============================================================
// 子系统相关性配置
// ============================================================

/** 子系统年龄阈值配置 */
const AGE_THRESHOLDS: Record<string, { minAge?: number; maxAge?: number }> = {
  // 儿童期相关
  'education': { minAge: 3, maxAge: 25, },
  // 成年期相关
  'work': { minAge: 16, },
  // 中老年相关
  'health': { minAge: 40, },
  // 修炼相关（视世界观而定）
  'cultivation': { minAge: 5, },
  'combat-power': { minAge: 10, },
}

/** 阶层相关子系统 */
const CLASS_RELEVANT_SYSTEMS: Record<string, string[]> = {
  'noble': ['faction-dynamics', 'reputation', 'economy', 'legal',],
  'commoner': ['economy', 'work', 'health',],
  'peasant': ['economy', 'health', 'population',],
  'merchant': ['economy', 'reputation',],
  'cultivator': ['cultivation', 'combat-power', 'luck',],
}

/** 势力相关子系统 */
const FACTION_RELEVANT_SYSTEMS: Record<string, string[]> = {
  'faction-dynamics': ['reputation', 'economy',],
}

/** 始终相关的子系统（不受过滤影响） */
const ALWAYS_RELEVANT = [
  'character-base',
  'health',
  'lifespan',
  'lifecycle-system',
  'morality',
  'luck',
  'historical-event-ledger',
]

// ============================================================
// 影响力维度（第五维）：角色力量等级 → 叙事因果影响范围
// ============================================================

/** 影响力等级 */
export type InfluenceScope = 'personal' | 'town' | 'region' | 'continent' | 'world'

/** 影响力等级阈值（基于本世界相对进度分数） */
const INFLUENCE_THRESHOLDS: Record<InfluenceScope, { minScore: number; label: string }> = {
  personal:  { minScore: 0, label: '个人', },
  town:      { minScore: 25, label: '聚落', },
  region:    { minScore: 50, label: '区域', },
  continent: { minScore: 75, label: '大范围', },
  world:     { minScore: 90, label: '世界', },
}

/** 各影响力等级对应的子系统（按范围递进） */
const INFLUENCE_SCOPE_SYSTEMS: Record<InfluenceScope, string[]> = {
  // 个人范围
  personal: [
    'health', 'education', 'work', 'character-base',
    'morality', 'luck', 'lifespan', 'lifecycle-system', 'faith',
  ],
  // 聚落范围（+经济、声望）
  town: [
    'economy', 'reputation', 'settlement', 'population',
  ],
  // 区域范围（+政治、生态）
  region: [
    'faction-dynamics', 'legal',
    'ecology', 'climate', 'geography',
  ],
  // 大范围（+文明、历史、科技）
  continent: [
    'culture-tech', 'social-stratification', 'art', 'works', 'conflict-cycle',
  ],
  // 世界范围
  world: [
    'spatial-graph', 'natural-resource', 'celestial',
    'fate-prophecy', 'divine-creation', 'historical-event-ledger',
  ],
}

/** 滑动窗口大小（保留最近几轮数据） */
const SLIDING_WINDOW_SIZE = 3

// ============================================================
// 子系统状态快照（用于滑动窗口）
// ============================================================

interface SystemStateSnapshot {
  round: number
  state: SubSystemState,
}

interface SystemChangeRecord {
  subsystemId: string
  round: number
  changeSummary: string,
}

// ============================================================
// 子系统相关性过滤系统
// ============================================================

export class SubsystemRelevanceSystem implements ISubSystem {
  readonly id = 'subsystem-relevance' as const
  readonly mod = 'mod-engine' as const
  readonly label = '子系统相关性过滤' as const
  readonly description = '五维相关性过滤 + 完整变更追踪；Prompt 使用非破坏性近期窗口' as const

  /** 各子系统的完整状态快照历史 */
  private stateHistory: Record<string, SystemStateSnapshot[]> = {}

  /** 变更记录（用于检测哪些系统有变化） */
  private changeRecords: SystemChangeRecord[] = []

  /** 当前回合数 */
  private currentRound = 0

  // ============================================================
  // ISubSystem 实现
  // ============================================================

  collectState(_context: RoundContext,): SubSystemState {
    const trackedSystems = Object.keys(this.stateHistory,).length
    const recentChanges = this.changeRecords.filter(r => r.round >= this.currentRound - SLIDING_WINDOW_SIZE,).length
    
    return {
      id: this.id,
      summary: `【${this.label}】追踪系统×${trackedSystems} | 最近${SLIDING_WINDOW_SIZE}轮变更×${recentChanges}`,
      data: structuredClone({
        trackedSystems,
        recentChanges,
        windowSize: SLIDING_WINDOW_SIZE,
      },) as unknown as Record<string, unknown>,
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext,): void {
    if (!changes || typeof changes !== 'object') {
      throw new Error(`[${this.id}] Invalid changes`);
    }
    if (changes.id !== this.id) {
      throw new Error(`[${this.id}] Changes ID mismatch`);
    }
    if (!changes.changes || typeof changes.changes !== 'object') {
      throw new Error(`[${this.id}] Invalid changes.changes`);
    }
    if (!changes.description || changes.description.trim() === '') {
      throw new Error(`[${this.id}] Missing changes.description`);
    }
    // 此系统不接受外部变更
  }

  reset(): void {
    this.stateHistory = {}
    this.changeRecords = []
    this.currentRound = 0
  }

  capturePreviewState(): unknown {
    return structuredClone({
      stateHistory: this.stateHistory,
      changeRecords: this.changeRecords,
      currentRound: this.currentRound,
    })
  }

  restorePreviewState(snapshot: unknown): void {
    if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return
    const value = snapshot as {
      stateHistory?: Record<string, SystemStateSnapshot[]>
      changeRecords?: SystemChangeRecord[]
      currentRound?: number
    }
    if (value.stateHistory) this.stateHistory = structuredClone(value.stateHistory)
    if (value.changeRecords) this.changeRecords = structuredClone(value.changeRecords)
    if (typeof value.currentRound === 'number') this.currentRound = value.currentRound
  }

  // ============================================================
  // 公共方法
  // ============================================================

  /**
   * 设置当前回合数
   */
  setRound(round: number,): void {
    this.currentRound = round
  }

  /**
   * 记录子系统状态；完整保留，近期窗口只在读取时选择
   */
  recordState(subsystemId: string, state: SubSystemState, round: number,): void {
    if (!this.stateHistory[subsystemId]) {
      this.stateHistory[subsystemId] = []
    }

    this.stateHistory[subsystemId].push({ round, state, })

  }

  /**
   * 记录子系统变更
   */
  recordChange(subsystemId: string, round: number, changeSummary: string,): void {
    this.changeRecords.push({ subsystemId, round, changeSummary, })

  }

  /**
   * 判断子系统是否相关
   * @param subsystemId 子系统ID
   * @param context 回合上下文
   * @returns 是否相关
   */
  isRelevant(subsystemId: string, context: RoundContext,): boolean {
    // 始终相关的系统直接返回 true
    if (ALWAYS_RELEVANT.includes(subsystemId,)) {
      return true
    }

    // 年龄过滤
    const ageThreshold = AGE_THRESHOLDS[subsystemId]
    if (ageThreshold) {
      const lifecycleData = context.subsystemStates['lifecycle-system']?.data as {
        entity?: { ageDays?: number }
      } | undefined
      const characterAge = Math.floor((lifecycleData?.entity?.ageDays ?? 0) / 365)
      if (ageThreshold.minAge && characterAge < ageThreshold.minAge) {
        return false
      }
      if (ageThreshold.maxAge && characterAge > ageThreshold.maxAge) {
        return false
      }
    }

    // 阶层过滤（从 economy 子系统获取阶层信息）
    const economyState = context.subsystemStates['economy']
    if (economyState?.data) {
      const economyData = economyState.data as Record<string, unknown>
      const socialClass = economyData.socialClass as string | undefined
      if (socialClass && CLASS_RELEVANT_SYSTEMS[socialClass]) {
        if (!CLASS_RELEVANT_SYSTEMS[socialClass].includes(subsystemId,)) {
          return false
        }
      }
    }

    // 势力过滤（从 faction-dynamics 子系统获取势力信息）
    const factionState = context.subsystemStates['faction-dynamics']
    if (factionState?.data) {
      const factionData = factionState.data as Record<string, unknown>
      const factionType = factionData.type as string | undefined
      if (factionType && FACTION_RELEVANT_SYSTEMS[factionType]) {
        if (!FACTION_RELEVANT_SYSTEMS[factionType].includes(subsystemId,)) {
          return false
        }
      }
    }

    // 影响力过滤（第五维）：角色力量等级决定可访问的子系统范围
    const influenceScore = this.calculateInfluenceScore(context.subsystemStates,)
    const scope = this.getInfluenceScope(influenceScore,)
    const allowedSystems = this.getInfluenceAllowedSystems(scope,)
    if (!allowedSystems.has(subsystemId,)) {
      return false
    }

    return true
  }

  /**
   * memorySummary【当前状态】专用：仅五维 isRelevant，不要求近轮变化。
   */
  getMemoryRelevantStates(
    allStates: Record<string, SubSystemState>,
    context: RoundContext,
  ): Record<string, SubSystemState> {
    const relevant: Record<string, SubSystemState> = {}
    for (const [subsystemId, state] of Object.entries(allStates)) {
      if (this.isRelevant(subsystemId, context)) {
        relevant[subsystemId] = state
      }
    }
    return relevant
  }

  /**
   * 获取相关的子系统状态（应用滑动窗口过滤，供 currentState / 速变段）
   */
  getRelevantStates(
    allStates: Record<string, SubSystemState>,
    context: RoundContext,
  ): Record<string, SubSystemState> {
    const relevant: Record<string, SubSystemState> = {}

    for (const [subsystemId, state,] of Object.entries(allStates,)) {
      // 过滤掉不相关的系统
      if (!this.isRelevant(subsystemId, context,)) {
        continue
      }

      // 检查最近几轮是否有变化
      const hasRecentChange = this.hasRecentChange(subsystemId, context.round.year,)

      // 如果有变化，或者系统始终相关且有状态历史，保留
      if (hasRecentChange || ALWAYS_RELEVANT.includes(subsystemId,)) {
        relevant[subsystemId] = state
      }
    }

    return relevant
  }

  /**
   * 检查子系统最近是否有变化
   * @param subsystemId 子系统ID
   * @param currentRound 当前回合
   * @returns 是否有变化
   */
  hasRecentChange(subsystemId: string, currentRound: number,): boolean {
    const recentChanges = this.changeRecords.filter(
      r => r.subsystemId === subsystemId && r.round >= currentRound - SLIDING_WINDOW_SIZE,
    )
    return recentChanges.length > 0
  }

  /**
   * 获取系统变化摘要（与前轮对比）
   * @param subsystemId 子系统ID
   * @param currentRound 当前回合
   * @returns 变化摘要文本
   */
  getChangeSummary(subsystemId: string, currentRound: number,): string | undefined {
    const recentChange = this.changeRecords.find(
      r => r.subsystemId === subsystemId && r.round === currentRound,
    )
    return recentChange?.changeSummary
  }

  /**
   * 构建滑动窗口变化摘要文本（用于注入 Prompt）
   * @param currentRound 当前回合
   * @returns 变化摘要文本
   */
  buildSlidingWindowSummary(currentRound: number,): string {
    const recentChanges = this.changeRecords.filter(
      r => r.round >= currentRound - SLIDING_WINDOW_SIZE && r.round <= currentRound,
    )

    if (recentChanges.length === 0) {
      return ''
    }

    const changesByRound: Record<number, SystemChangeRecord[]> = {}
    for (const change of recentChanges) {
      if (!changesByRound[change.round]) {
        changesByRound[change.round] = []
      }
      changesByRound[change.round].push(change,)
    }

    const parts: string[] = []
    parts.push('【最近变化】',)
    
    for (const round of Object.keys(changesByRound,).sort((a, b,) => Number(b,) - Number(a,))) {
      const roundChanges = changesByRound[Number(round,)]
      const roundLabel = Number(round,) === currentRound ? '本轮' : `第${round}轮`
      const changesText = roundChanges.map(c => `${c.subsystemId}: ${c.changeSummary}`,).join('；',)
      parts.push(`${roundLabel}：${changesText}`,)
    }

    return parts.join('\n',)
  }

  /**
   * 获取不相关的子系统列表（用于调试和统计）
   * @param allStates 所有子系统状态
   * @param context 回合上下文
   * @returns 不相关的子系统ID列表
   */
  getIrrelevantSystems(
    allStates: Record<string, SubSystemState>,
    context: RoundContext,
  ): string[] {
    const irrelevant: string[] = []

    for (const subsystemId of Object.keys(allStates,)) {
      if (!this.isRelevant(subsystemId, context,)) {
        irrelevant.push(subsystemId,)
      }
    }

    return irrelevant
  }

  // ============================================================
  // 影响力维度（第五维）
  // ============================================================

  /**
   * 计算角色在当前世界框架中的相对影响力分数（0-100）。
   * 不同世界只比较各自框架内的进度，不比较固定阶位或跨世界绝对战力。
   */
  calculateInfluenceScore(subsystemStates: Record<string, SubSystemState>,): number {
    const combat = subsystemStates['combat-power']?.data as {
      framework?: { enabled?: boolean; ranks?: Array<{ index?: number }> }
      rankIndex?: number
      subStage?: number
    } | undefined
    const ranks = Array.isArray(combat?.framework?.ranks) ? combat.framework.ranks : []
    const rankIndex = typeof combat?.rankIndex === 'number' ? combat.rankIndex : 0
    const subStage = typeof combat?.subStage === 'number' ? combat.subStage : 1
    const rankProgress = combat?.framework?.enabled && ranks.length > 0
      ? ((Math.max(0, rankIndex - 1) + Math.max(0, Math.min(5, subStage) - 1) / 5) / ranks.length) * 100
      : 0
    const cultivation = subsystemStates['cultivation']?.data as { realmIndex?: number } | undefined
    const cultivationProgress = typeof cultivation?.realmIndex === 'number' && ranks.length > 0
      ? (Math.max(0, cultivation.realmIndex - 1) / ranks.length) * 100
      : 0
    const faith = subsystemStates['faith']?.data as { devotionLevel?: number } | undefined
    const faithProgress = typeof faith?.devotionLevel === 'number'
      ? Math.max(0, Math.min(100, faith.devotionLevel))
      : 0
    const luck = subsystemStates['luck']?.data as { luck?: number } | undefined
    const luckProgress = typeof luck?.luck === 'number'
      ? Math.max(0, Math.min(100, (luck.luck + 10) * 5))
      : 0
    return Math.round(Math.max(rankProgress, cultivationProgress, faithProgress, luckProgress))
  }

  /** 根据本世界相对影响力分数确定作用范围。 */
  getInfluenceScope(influenceScore: number,): InfluenceScope {
    if (influenceScore >= INFLUENCE_THRESHOLDS.world.minScore) return 'world'
    if (influenceScore >= INFLUENCE_THRESHOLDS.continent.minScore) return 'continent'
    if (influenceScore >= INFLUENCE_THRESHOLDS.region.minScore) return 'region'
    if (influenceScore >= INFLUENCE_THRESHOLDS.town.minScore) return 'town'
    return 'personal'
  }

  /**
   * 获取影响力等级允许访问的子系统 ID 集合
   *
   * @param scope 影响力等级
   * @returns 允许访问的子系统 ID 集合
   */
  getInfluenceAllowedSystems(scope: InfluenceScope,): Set<string> {
    const allowed = new Set<string>()
    const scopes: InfluenceScope[] = ['personal', 'town', 'region', 'continent', 'world',]
    const startIdx = scopes.indexOf(scope,)

    // 递进式：高等级自动包含低等级的所有子系统
    for (let i = 0; i <= startIdx; i++) {
      for (const sysId of INFLUENCE_SCOPE_SYSTEMS[scopes[i]]) {
        allowed.add(sysId,)
      }
    }

    return allowed
  }

  /**
   * 构建影响力信息文本（用于注入 Prompt）
   *
   * @param scope 影响力等级
   * @returns 影响力信息文本
   */
  buildInfluenceText(scope: InfluenceScope,): string {
    const threshold = INFLUENCE_THRESHOLDS[scope]
    return `【角色影响范围】${threshold.label}`
  }
}

/** 单例 */
export const subsystemRelevance = new SubsystemRelevanceSystem()
