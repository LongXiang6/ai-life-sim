/**
 * @module subsystem-relevance-system.ts
 * @description 子系统相关性过滤 + 滑动窗口 —— 五维过滤（年龄/阶层/势力/影响力/始终相关）+ 系统数据动态卸载
 * @mod mod-engine
 *
 * 设计理念：传递给 AI 的数据 = 不可变信息 + 叙事故事 + 部分系统数据
 * - 只保留最近 3 轮有变化的系统数据，节约 token
 * - 根据角色年龄/阶层/势力/影响力等判断哪些系统数据需要传入 Prompt
 *
 * 五维过滤：
 *   1. 年龄过滤：根据角色年龄决定哪些系统相关
 *   2. 阶层过滤：根据社会阶层决定哪些系统相关
 *   3. 势力过滤：根据所属势力决定哪些系统相关
 *   4. 影响力过滤：根据角色力量等级决定叙事因果影响范围（个人/区域/世界）
 *   5. 始终相关：某些系统始终需要（如健康、寿命）
 *
 * 影响力维度（第五维）：
 *   角色的力量等级越高，其叙事因果的影响范围越大。
 *   - 凡人（力量 0-30）：只关注个人和家庭级别的信息
 *   - 强者（力量 31-70）：关注城镇和区域级别的信息
 *   - 大能（力量 71-90）：关注大陆和国家级别的信息
 *   - 至强者（力量 91+）：关注世界和宇宙级别的信息
 */

import type { ISubSystem, RoundContext, SubSystemState, SubSystemChanges, } from '@/foundation'

// ============================================================
// 子系统相关性配置
// ============================================================

/** 子系统年龄阈值配置 */
const AGE_THRESHOLDS: Record<string, { minAge?: number; maxAge?: number }> = {
  // 儿童期相关
  'education': { minAge: 3, maxAge: 25, },
  'family': { minAge: 0, maxAge: 20, },
  
  // 成年期相关
  'work': { minAge: 16, },
  'relationship': { minAge: 14, },
  'marriage': { minAge: 16, },
  
  // 中老年相关
  'health': { minAge: 40, },
  'retirement': { minAge: 55, },
  
  // 修炼相关（视世界观而定）
  'cultivation': { minAge: 5, },
  'combat-power': { minAge: 10, },
}

/** 阶层相关子系统 */
const CLASS_RELEVANT_SYSTEMS: Record<string, string[]> = {
  'noble': ['faction-dynamics', 'reputation', 'economy', 'legal',],
  'commoner': ['economy', 'work', 'health',],
  'peasant': ['economy', 'health', 'population',],
  'merchant': ['economy', 'market', 'reputation',],
  'cultivator': ['cultivation', 'combat-power', 'luck',],
}

/** 势力相关子系统 */
const FACTION_RELEVANT_SYSTEMS: Record<string, string[]> = {
  'faction-dynamics': ['reputation', 'power', 'economy',],
  'nation-relation': ['reputation', 'power', 'military',],
}

/** 始终相关的子系统（不受过滤影响） */
const ALWAYS_RELEVANT = [
  'character-base',
  'health',
  'lifespan',
  'morality',
  'luck',
]

// ============================================================
// 影响力维度（第五维）：角色力量等级 → 叙事因果影响范围
// ============================================================

/** 影响力等级 */
export type InfluenceScope = 'personal' | 'town' | 'region' | 'continent' | 'world'

/** 影响力等级阈值（基于角色总力量值） */
const INFLUENCE_THRESHOLDS: Record<InfluenceScope, { minPower: number; label: string }> = {
  personal:  { minPower: 0,  label: '凡人', },
  town:      { minPower: 31, label: '强者', },
  region:    { minPower: 71, label: '大能', },
  continent: { minPower: 91, label: '至强者', },
  world:     { minPower: 121, label: '超凡入圣', },
}

/** 各影响力等级对应的子系统（按范围递进） */
const INFLUENCE_SCOPE_SYSTEMS: Record<InfluenceScope, string[]> = {
  // 凡人：个人和家庭级别
  personal: [
    'health', 'family', 'education', 'work', 'character-base',
    'morality', 'luck', 'lifespan', 'faith',
  ],
  // 强者：城镇级别（+ 经济、声望、关系）
  town: [
    'economy', 'reputation', 'relationship', 'marriage',
    'market', 'settlement', 'population',
  ],
  // 大能：区域级别（+ 势力、国家、生态）
  region: [
    'faction-dynamics', 'nation-relation', 'legal',
    'ecology', 'climate', 'terrain', 'military',
  ],
  // 至强者：大陆级别（+ 文明、历史、科技）
  continent: [
    'culture-tech', 'history-dynamics', 'social-stratification',
    'trade-route', 'disaster',
  ],
  // 超凡入圣：世界/宇宙级别
  world: [
    'world-map', 'divine-realm', 'cosmic-phenomena',
    'realm-barrier', 'celestial-cycle',
  ],
}

/** 力量值来源子系统 ID（按优先级） */
const POWER_SOURCE_SUBSYSTEMS = [
  'cultivation',   // 修仙境界
  'combat-power',  // 战力
  'faith',         // 信仰（神明赐予）
  'luck',          // 气运
]

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
  readonly description = '四维过滤（年龄/阶层/势力/始终相关）+ 系统数据动态卸载，只保留最近3轮有变化的系统数据' as const

  /** 各子系统的状态快照历史（滑动窗口） */
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
   * 记录子系统状态（用于滑动窗口）
   */
  recordState(subsystemId: string, state: SubSystemState, round: number,): void {
    if (!this.stateHistory[subsystemId]) {
      this.stateHistory[subsystemId] = []
    }

    this.stateHistory[subsystemId].push({ round, state, })

    // 保持滑动窗口大小
    while (this.stateHistory[subsystemId].length > SLIDING_WINDOW_SIZE) {
      this.stateHistory[subsystemId].shift()
    }
  }

  /**
   * 记录子系统变更
   */
  recordChange(subsystemId: string, round: number, changeSummary: string,): void {
    this.changeRecords.push({ subsystemId, round, changeSummary, })

    // 清理过期记录（保留最近 2*SLIDING_WINDOW_SIZE 条）
    const cutoffRound = round - SLIDING_WINDOW_SIZE * 2
    this.changeRecords = this.changeRecords.filter(r => r.round >= cutoffRound,)
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
      const characterAge = context.round.year
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
    const totalPower = this.calculateTotalPower(context.subsystemStates,)
    const scope = this.getInfluenceScope(totalPower,)
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
   * 计算角色的总力量值（从各力量来源子系统提取）
   *
   * @param subsystemStates 所有子系统状态
   * @returns 总力量值（0-200+）
   */
  calculateTotalPower(subsystemStates: Record<string, SubSystemState>,): number {
    let totalPower = 0

    for (const subId of POWER_SOURCE_SUBSYSTEMS) {
      const state = subsystemStates[subId]
      if (!state?.data) continue

      const data = state.data as Record<string, unknown>

      switch (subId) {
        case 'cultivation': {
          // 修炼境界：realm 数值 × 10
          const realm = (data.realm as number) ?? 0
          totalPower += realm * 10
          break
        }
        case 'combat-power': {
          // 战力：rank 数值 × 3
          const rank = (data.rank as number) ?? 0
          totalPower += rank * 3
          break
        }
        case 'faith': {
          // 信仰：devotionLevel × 0.5
          const devotionLevel = (data.devotionLevel as number) ?? 0
          totalPower += Math.round(devotionLevel * 0.5,)
          break
        }
        case 'luck': {
          // 气运：bonus × 1
          const bonus = (data.bonus as number) ?? 0
          totalPower += bonus
          break
        }
      }
    }

    return totalPower
  }

  /**
   * 根据力量值确定影响力等级
   *
   * @param totalPower 角色总力量值
   * @returns 影响力等级
   */
  getInfluenceScope(totalPower: number,): InfluenceScope {
    if (totalPower >= INFLUENCE_THRESHOLDS.world.minPower) return 'world'
    if (totalPower >= INFLUENCE_THRESHOLDS.continent.minPower) return 'continent'
    if (totalPower >= INFLUENCE_THRESHOLDS.region.minPower) return 'region'
    if (totalPower >= INFLUENCE_THRESHOLDS.town.minPower) return 'town'
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
   * @param totalPower 角色总力量值
   * @param scope 影响力等级
   * @returns 影响力信息文本
   */
  buildInfluenceText(totalPower: number, scope: InfluenceScope,): string {
    const threshold = INFLUENCE_THRESHOLDS[scope]
    return `【角色影响力】等级：${threshold.label}（力量值：${totalPower}）`
  }
}

/** 单例 */
export const subsystemRelevance = new SubsystemRelevanceSystem()
