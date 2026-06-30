/**
 * @module CultivationSystem
 * @description 修炼体系子系统 —— 与战力体系"合作模式"：战力计算唯一数值，修炼提供身份标签+训练加成+瓶颈叙事
 * @mod mod-power-system
 */

import type {
  ISubSystem,
  SubSystemState,
  SubSystemChanges,
  RoundContext,
} from '@/foundation'
import { getRoundSequence } from '@/foundation'
import type { CultivationState } from '../types'
import { getFormulaModifier, resolveStaticPoolWorldviewKey } from '@/mods/mod-world'

// ========== 常量 ==========

/** 战力阶位 → 修炼境界索引映射（只做查表，不改变战力数值） */
const STAGE_TO_REALM: Record<number, number> = {
  1: 0, 2: 0,      // 尘/万 → 凡人
  3: 1,             // 亿 → 感气
  4: 2,             // 兆 → 筑基
  5: 3,             // 京 → 金丹
  6: 4,             // 垓 → 元婴
  7: 5,             // 秭 → 化神
  8: 6,             // 穰 → 合道
  9: 7,             // 沟 → 渡劫
  10: 8, 11: 8,     // 涧/正 → 真仙
  12: 8, 13: 8,     // 载/极 → 真仙
  14: 8, 15: 8,     // 恒河沙/阿僧祇 → 真仙
  16: 8, 17: 8,     // 那由它/不可思议 → 真仙
  18: 8, 19: 8,     // 无量/大数 → 真仙
  20: 8, 21: 8,     // 无量大数/虚空 → 真仙
  22: 8, 23: 8,     // 混沌/道 → 真仙
  24: 8,            // 真无限 → 真仙
}

/** 世界观分层境界标签：各世界观下 9 个境界的显示名称 */
const REALM_LABELS_BY_WORLDVIEW: Record<string, readonly string[]> = {
  cultivation: ['凡人', '感气', '筑基', '金丹', '元婴', '化神', '合道', '渡劫', '真仙'],
  eastern_fantasy: ['凡人', '感气', '筑基', '金丹', '元婴', '化神', '合道', '渡劫', '真仙'],
  idealist: ['凡人', '感气', '筑基', '金丹', '元婴', '化神', '合道', '渡劫', '真仙'],
  wuxia: ['入门', '熟练', '精通', '大师', '宗师', '化境', '超凡', '入圣', '天人合一'],
  scifi: ['初级', '中级', '高级', '专家', '大师', '传奇', '史诗', '神话', '超越'],
  western_fantasy: ['学徒', '见习', '初级法师', '中级法师', '高级法师', '大法师', '贤者', '半神', '神祇'],
  survival_horror: ['幸存者', '老手', '硬汉', '孤狼', '传奇', '噩梦', '不朽', '永恒', '超越死亡'],
  post_apocalyptic: ['拾荒者', '游民', '猎人', '酋长', '军阀', '传奇', '不朽', '神话', '废土之神'],
  materialist: ['入门', '熟练', '精通', '大师', '宗师', '化境', '超凡', '入圣', '天人合一'],
}

const REALM_IDS: readonly string[] = [
  'mortal', 'qiSensing', 'foundationBuilding', 'goldenCore',
  'nascentSoul', 'spiritSevering', 'daoSeeking', 'tribulation', 'immortal',
]

/** 天赋对训练速度的加成乘数 */
const TALENT_BONUSES: Record<string, number> = {
  cultivation_genius: 0.50,
  spirit_body: 0.30,
  dual_cultivation: 0.20,
  breakthrough_prodigy: 0.20,
  strategist: 0.10,
}

/** 瓶颈突破基础概率（对应到下一境界的索引） */
const BOTTLENECK_BASE_CHANCES: readonly number[] = [
  1.0,   // 凡人→感气
  0.80,  // 感气→筑基
  0.60,  // 筑基→金丹
  0.40,  // 金丹→元婴
  0.30,  // 元婴→化神
  0.20,  // 化神→合道
  0.15,  // 合道→渡劫
  0.10,  // 渡劫→真仙
]

const BOTTLENECK_PENALTY_PER_FAILURE = 20
const BREAKTHROUGH_PRODIGY_BONUS = 0.20
const TRAINING_BONUS_MAX = 2.2

/** 境界间最小突破间隔（年），来源废案 MIN_YEARS_BETWEEN_REALMS */
const MIN_YEARS_BETWEEN_REALMS: readonly number[] = [0, 3, 5, 8, 12, 18, 25, 50]

/** 瓶颈绝境叙事提示词 */
const BOTTLENECK_NARRATIVE_HINTS: Record<string, string> = {
  qiSensing: '你日夜吐纳，感到体内气息奔流不息，但始终差一丝契机…',
  foundationBuilding: '灵根已固，但筑基之壁坚如磐石。你需要更大的压力或机缘来打破它。',
  goldenCore: '灵气在丹田凝聚又散去，金丹始终无法成型。也许你缺的不是苦修，而是一场死战。',
  nascentSoul: '元婴雏形在识海中若隐若现，但每次凝聚都差毫厘。你感到若再不得法，此生或将止步于此。',
  spiritSevering: '化神之路需斩断执念，而你心中的执念太过沉重。你需要面对自己的心魔。',
  daoSeeking: '合道之境虚无缥缈，万物法则在你眼前盘旋，但始终无法抓住那一条属于自己的道。',
  tribulation: '天劫的气息已在头顶凝聚，但你清楚——以当前的状态渡劫，十死无生。你需要更强的底蕴。',
}

/** 突破预兆描述 */
const BREAKTHROUGH_ANTICIPATION_HINTS: readonly string[] = [
  '灵气在你体内超常活跃，仿佛在呼唤某种变化',
  '修炼时屡次出现心潮澎湃之感，你预感到突破的契机正在靠近',
  '天地灵气主动涌入你体内，丹田已有满溢之兆',
  '你感到瓶颈开始松动，突破的冲动几乎压抑不住',
  '修炼效率突然翻倍，仿佛大道在向你招手',
]

// ========== 工具函数 ==========

function clamp(v: number, min: number, max: number): number {
  return Math.min(Math.max(v, min), max)
}

function getRealmLabels(worldview?: string): readonly string[] {
  const key = resolveStaticPoolWorldviewKey(worldview ?? '')
  if (key in REALM_LABELS_BY_WORLDVIEW) {
    return REALM_LABELS_BY_WORLDVIEW[key]
  }
  if (key === 'default') return REALM_LABELS_BY_WORLDVIEW['materialist']
  return REALM_LABELS_BY_WORLDVIEW['cultivation']
}

// ========== 子系统 ==========

export class CultivationSystem implements ISubSystem {
  readonly id = 'cultivation' as const
  readonly mod = 'mod-power-system' as const
  readonly label = '修炼体系' as const
  readonly description = '与战力体系合作：提供境界身份标签、天赋训练加成、瓶颈突破判定、突破叙事提示' as const

  private _state: CultivationState = {
    enabled: false,
    worldview: undefined,
    talentTags: [],
    realmIndex: 0,
    realmLabel: '凡人',
    realmId: 'mortal',
    bottleneckPenalty: 0,
    breakthroughChance: 1,
    anticipation: 0,
    bottleneckHint: '',
    trainingBonus: 1,
    lastBreakthroughYear: 0,
  }

  private _lastProcessedRound = -1

  collectState(context: RoundContext): SubSystemState {
    if (getRoundSequence(context) === this._lastProcessedRound) {
      return this._buildResult()
    }
    this._lastProcessedRound = getRoundSequence(context)

    this._analyze(context)
    return this._buildResult()
  }

  /** Round 2：乘入 faith 突破加成（Round 1 同轮不可跨读 subsystemStates） */
  collectStateUpdate(context: RoundContext): SubSystemState | null {
    if (!this._state.enabled || this._state.breakthroughChance <= 0) return null

    const faithData = context.subsystemStates['faith']?.data as { breakthroughBonus?: number } | undefined
    const faithBonus = typeof faithData?.breakthroughBonus === 'number' ? faithData.breakthroughBonus : 1
    if (faithBonus === 1) return null

    this._state.breakthroughChance = clamp(this._state.breakthroughChance * faithBonus, 0, 1)
    return this._buildResult()
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    const { id } = changes;
    const plain = changes.changes ?? {};
    const desc = changes.description ?? '';
    void desc;
    void changes.changes;
    if (!changes || typeof changes !== 'object') return
    if (changes.changes && changes.id === this.id) {
      const c = changes.changes
      if (typeof c.bottleneckPenalty !== 'undefined') this._state.bottleneckPenalty = c.bottleneckPenalty as number
      if (typeof c.talentTags !== 'undefined') this._state.talentTags = c.talentTags as string[]
    }
    void id; void plain;
  }

  reset(): void {
    this._state = {
      enabled: false, worldview: undefined, talentTags: [],
      realmIndex: 0, realmLabel: '凡人', realmId: 'mortal',
      bottleneckPenalty: 0, breakthroughChance: 1,
      anticipation: 0, bottleneckHint: '', trainingBonus: 1,
      lastBreakthroughYear: 0,
    }
    this._lastProcessedRound = -1
  }

  // ========== 公开方法 ==========

  /** 获取战力训练加成倍率（供 CombatPowerSystem 在 advancePowerValue 前调用） */
  getTrainingBonus(): number {
    return this._state.enabled ? this._state.trainingBonus : 1.0
  }

  /** 获取突破修正概率 */
  getBreakthroughChance(): number {
    return this._state.breakthroughChance
  }

  /** 获取瓶颈惩罚值 */
  getBottleneckPenalty(): number {
    return this._state.bottleneckPenalty
  }

  /** 记录突破失败（由 CombatPowerSystem 在 subStage=5 且跨阶判定失败时调用） */
  recordBreakthroughFailure(): void {
    this._state.bottleneckPenalty += BOTTLENECK_PENALTY_PER_FAILURE
    this._state.breakthroughChance = Math.max(
      this._state.breakthroughChance - 0.05,
      0.05,
    )
  }

  /** 记录突破成功 */
  recordBreakthroughSuccess(year: number): void {
    this._state.bottleneckPenalty = 0
    this._state.lastBreakthroughYear = year
  }

  // ========== 私有方法 ==========

  private _analyze(context: RoundContext): void {
    // 从 RoundContext 读取 CombatPower 状态
    const cpData = context.subsystemStates['combat-power']?.data as Record<string, unknown> | undefined
    if (!cpData) {
      this._state.enabled = false
      return
    }

    const mainStage = cpData.mainStage as number ?? 1
    const subStage = cpData.subStage as number ?? 1
    const powerValue = cpData.powerValue as number ?? 1

    // 解析世界观
    const worldview = this._state.worldview ?? this._resolveWorldview(context)
    this._state.worldview = worldview

    // 解析天赋标签（从 character-base-system 读取）
    const talentTags = this._resolveTalentTags(context)
    this._state.talentTags = talentTags

    // 1) 境界标签映射
    const realmIndex = STAGE_TO_REALM[mainStage] ?? 0
    this._state.realmIndex = realmIndex
    const labels = getRealmLabels(worldview)
    this._state.realmLabel = labels[realmIndex] ?? '未知'
    this._state.realmId = REALM_IDS[realmIndex] ?? 'mortal'

    // 2) 训练加成
    let bonus = 1.0
    for (const tag of talentTags) {
      bonus += TALENT_BONUSES[tag] ?? 0
    }
    this._state.trainingBonus = clamp(bonus, 1.0, TRAINING_BONUS_MAX)

    // 3) 突破概率（境界越高越难）
    const nextRealm = realmIndex + 1
    if (nextRealm >= BOTTLENECK_BASE_CHANCES.length) {
      this._state.breakthroughChance = 0
    } else {
      let chance = BOTTLENECK_BASE_CHANCES[nextRealm] * getFormulaModifier('bottleneckModifier')
      if (talentTags.includes('breakthrough_prodigy')) chance += BREAKTHROUGH_PRODIGY_BONUS

      // 最小突破间隔检查（来源废案 MIN_YEARS_BETWEEN_REALMS）
      const minYears = MIN_YEARS_BETWEEN_REALMS[realmIndex] ?? 0
      const yearsSinceBreakthrough = context.round.year - this._state.lastBreakthroughYear
      if (minYears > 0 && yearsSinceBreakthrough < minYears) {
        chance = 0 // 间隔不足，禁止突破
      }

      this._state.breakthroughChance = clamp(chance, 0, 1)
    }

    // 4) 突破预兆
    this._state.anticipation = 0
    if (subStage === 5 && powerValue > 9000 && this._state.bottleneckPenalty < 20) {
      if (powerValue >= 9500) this._state.anticipation = 5
      else if (powerValue >= 9300) this._state.anticipation = 4
      else if (powerValue >= 9200) this._state.anticipation = 3
      else if (powerValue >= 9100) this._state.anticipation = 2
      else this._state.anticipation = 1
    }

    // 5) 瓶颈叙事提示
    if (this._state.bottleneckPenalty >= 20 && nextRealm < REALM_IDS.length) {
      const realmId = REALM_IDS[realmIndex]
      const specificHint = BOTTLENECK_NARRATIVE_HINTS[realmId]
      if (specificHint && this._state.bottleneckPenalty >= 40) {
        this._state.bottleneckHint = `【瓶颈绝望】${specificHint} 你已尝试突破数次却屡遭失败，瓶颈惩罚已达${this._state.bottleneckPenalty}。你需要一个契机——也许是机缘，也许是死战。`
      } else if (specificHint) {
        this._state.bottleneckHint = `【瓶颈提示】${specificHint}`
      }
    } else {
      this._state.bottleneckHint = ''
    }

    this._state.enabled = !!worldview && worldview !== 'materialist'
  }

  private _resolveWorldview(context: RoundContext): string | undefined {
    const baseUniverse = context.subsystemStates['base-universe']
    if (baseUniverse?.data) {
      return (baseUniverse.data as Record<string, unknown>).worldview as string | undefined
    }
    return undefined
  }

  private _resolveTalentTags(context: RoundContext): string[] {
    const charBase = context.subsystemStates['character-base']?.data as Record<string, unknown> | undefined
    const tags = charBase?.talentTags as string[] | undefined
    return tags ?? []
  }

  private _buildResult(): SubSystemState {
    const s = this._state
    if (!s.enabled) {
      return {
        id: this.id,
        summary: '',
        data: structuredClone(s as unknown as Record<string, unknown>),
      }
    }

    const parts: string[] = []
    parts.push(`修炼境界：${s.realmLabel} | 训练加成：×${s.trainingBonus.toFixed(1)}`)
    if (s.bottleneckPenalty >= 40) parts.push(`⚠️ 瓶颈惩罚：${s.bottleneckPenalty}`)
    if (s.anticipation >= 4) {
      const hint = BREAKTHROUGH_ANTICIPATION_HINTS[Math.min(s.anticipation - 1, 4)]
      parts.push(`突破预兆：${hint}`)
    }
    if (s.bottleneckHint) parts.push(s.bottleneckHint)
    if (s.breakthroughChance > 0) parts.push(`突破概率：${Math.round(s.breakthroughChance * 100)}%`)

    return {
      id: this.id,
      summary: `【${this.label}】${parts.join(' | ')}`,
      data: structuredClone(s as unknown as Record<string, unknown>),
    }
  }
}
