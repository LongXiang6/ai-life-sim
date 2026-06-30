/**
 * @module cross-domain-rules.ts
 * @description 跨域联动规则引擎 —— 事件触发 → 规则匹配 → 产出跨子系统指令
 * @mod mod-engine
 *
 * 来源：废案 WorldEventBus + registerSystemRules()
 *
 * 11 条规则（5 条宏观事件驱动 + 6 条角色状态驱动）：
 *   宏观事件驱动（纯关键词匹配）：
 *     1. 生态灾难 → 人口减少 + 财富损失
 *     2. 战争/冲突 → 派系紧张 + 难民增加
 *     3. 技术突破 → 科技进度推进
 *     4. 贸易波动 → 市场活跃度修正
 *     5. 社会动荡 → 犯罪率 + 教育中断
 *   角色状态驱动（dataCondition 读取子系统数值）：
 *     6. 英雄陨落 → HP<20 → 声望+10, 派系贡献+20
 *     7. 道德灯塔 → 道德>80且声望>60 → 社会价值观善偏移, 执法+5
 *     8. 魔王降临 → 道德<-80且战力≥3阶 → 社会价值观恶偏移, 派系贡献+30
 *     9. 继承危机 → HP<30且寿命将尽 → 派系动荡, 执法-10
 *    10. 天选之人 → 幸运>8且信仰>80 → 天象祝福, 人口增长
 *    11. 文明推手 → 心智>8且科技>50% → 科技推进, 识字率+2
 */

import type { SubSystemChanges } from '@/foundation'

import { evaluateCrossDomainDispatch } from '../simulation/simulation-kernel'

// ============================================================
// 类型定义
// ============================================================

/** 域事件 */
export interface DomainEvent {
  id: string
  type: string
  sourceCategory: string
  severity: 'critical' | 'major' | 'normal' | 'minor'
  description: string
  context: Record<string, unknown>
  eraYear: number,
}

/** 子系统指令 */
export interface SubsystemInstruction {
  targetSystemId: string
  action: 'modify' | 'enable' | 'disable' | 'reset' | 'custom'
  params: Record<string, unknown>
  sourceEventId: string,
  /** 命名动作（可选）：目标子系统 crossDomainActions 中的 key，用于分布式参数覆盖 */
  namedAction?: string,
}

/** 联动规则 */
export interface CrossDomainRule {
  id: string
  eventTypePattern: string
  condition: (event: DomainEvent) => boolean
  /**
   * 新增：数值条件（从子系统 data 读取），返回 true 时触发此规则。
   * 用于角色状态驱动的规则——不依赖事件描述，直接读取子系统数据判定。
   * 与 condition() 是 AND 关系：两者都通过才触发。
   */
  dataCondition?: (subsystemStates: Record<string, unknown>) => boolean
  handler: (event: DomainEvent, subsystemStates?: Record<string, unknown>) => SubsystemInstruction[]
  priority: number,
  /** 冷却轮数（0=每轮均可触发，>0=触发后冷却 N 轮） */
  cooldownRounds?: number,
}

// ============================================================
// 规则注册
// ============================================================

export function registerAllRules(): CrossDomainRule[] {
  const rules: CrossDomainRule[] = []

  // 规则1：生态灾难 → 冲击人口 + 经济
  rules.push({
    id: 'ecology-disaster-population',
    eventTypePattern: '*',
    condition: (e) => {
      const d = e.description ?? ''
      return d.includes('生态') || d.includes('灾难') || d.includes('灭绝')
        || d.includes('生态崩溃') || d.includes('生态恶化') || d.includes('过度开发')
        || d.includes('干旱') || d.includes('洪涝') || d.includes('严寒') || d.includes('辐射风暴') || d.includes('天旱')
    },
    handler: (e) => {
      const vc = e.context?.valueChanges as Record<string, number> | undefined
      return [
        {
          targetSystemId: 'population',
          action: 'modify',
          params: { populationDelta: -Math.abs(vc?.populationDrop ?? 5) },
          sourceEventId: e.id,
        },
        {
          targetSystemId: 'economy',
          action: 'modify',
          params: { wealthDelta: -Math.abs(vc?.wealthLoss ?? 10) },
          sourceEventId: e.id,
        },
      ]
    },
    priority: 10,
  })

  // 规则2：战争/冲突 → 冲击派系动态 + 人口流动性
  rules.push({
    id: 'war-faction-mobility',
    eventTypePattern: '*',
    condition: (e) => {
      const d = e.description ?? ''
      return d.includes('战争') || d.includes('冲突') || d.includes('入侵')
        || d.includes('边境冲突') || d.includes('国际紧张') || d.includes('势力冲突')
    },
    handler: (e) => {
      const vc = e.context?.valueChanges as Record<string, number> | undefined
      return [
        {
          targetSystemId: 'conflict-cycle',
          action: 'modify',
          params: { tensionDelta: (vc?.tensionMod ?? 10) },
          sourceEventId: e.id,
        },
        {
          targetSystemId: 'population',
          action: 'modify',
          params: { migrationInflow: (vc?.refugeeCount ?? 5) },
          sourceEventId: e.id,
        },
      ]
    },
    priority: 10,
  })

  // 规则3：技术突破 → 推动文化技术进度
  rules.push({
    id: 'tech-breakthrough-culture',
    eventTypePattern: '*',
    condition: (e) => {
      const d = e.description ?? ''
      return d.includes('技术') || d.includes('突破') || d.includes('发明') || d.includes('文化复兴')
    },
    handler: (e) => {
      const vc = e.context?.valueChanges as Record<string, number> | undefined
      return [
        {
          targetSystemId: 'culture-tech',
          action: 'modify',
          params: { techProgressDelta: (vc?.techBoost ?? 5) / 100 },
          sourceEventId: e.id,
        },
      ]
    },
    priority: 5,
  })

  // 规则4：贸易波动 → 影响市场周期
  rules.push({
    id: 'trade-market-impact',
    eventTypePattern: '*',
    condition: (e) => {
      const d = e.description ?? ''
      return d.includes('贸易') || d.includes('商业') || d.includes('市场')
        || d.includes('商路') || d.includes('贸易萎缩') || d.includes('市场动荡') || d.includes('市场崩溃')
    },
    handler: (e) => {
      const vc = e.context?.valueChanges as Record<string, number> | undefined
      return [
        {
          targetSystemId: 'economy',
          action: 'modify',
          params: { wealthDelta: Math.round((vc?.marketMod ?? 0.1) * 100) },
          sourceEventId: e.id,
        },
      ]
    },
    priority: 5,
  })

  // 规则5：社会动荡 → 影响法律 + 教育
  rules.push({
    id: 'unrest-legal-education',
    eventTypePattern: '*',
    condition: (e) => {
      const d = e.description ?? ''
      return d.includes('动荡') || d.includes('暴乱') || d.includes('造反')
        || d.includes('世家没落') || d.includes('人口流失') || d.includes('社会')
    },
    handler: (e) => {
      const vc = e.context?.valueChanges as Record<string, number> | undefined
      return [
        {
          targetSystemId: 'legal',
          action: 'modify',
          params: { corruptionDelta: (vc?.crimeMod ?? 3) },
          sourceEventId: e.id,
        },
        {
          targetSystemId: 'education',
          action: 'modify',
          params: { literacyRateDelta: -(vc?.eduDisruption ?? 2) },
          sourceEventId: e.id,
        },
      ]
    },
    priority: 8,
  })

  // ============================================================
  // 角色状态驱动规则（dataCondition 读取子系统数值）
  // ============================================================

  // 规则6：英雄陨落 → HP 极低时声望+派系贡献提升
  rules.push({
    id: 'hero-fall-reputation',
    eventTypePattern: '*',
    condition: () => true, // 不依赖事件描述，完全由 dataCondition 驱动
    dataCondition: (states) => {
      const health = states['health'] as Record<string, unknown> | undefined
      const hp = (health?.hp as number) ?? 100
      return hp < 20
    },
    handler: (e, _states) => [
      {
        targetSystemId: 'faction-dynamics',
        action: 'modify',
        params: { addContribution: 20 },
        sourceEventId: e.id,
      },
      {
        targetSystemId: 'reputation',
        action: 'modify',
        params: { addFame: 10 },
        sourceEventId: e.id,
      },
    ],
    priority: 15,
    cooldownRounds: 5, // 每 5 轮最多触发一次
  })

  // 规则7：道德灯塔 → 高道德+高声望 → 社会价值观善偏移
  rules.push({
    id: 'moral-beacon-values',
    eventTypePattern: '*',
    condition: () => true,
    dataCondition: (states) => {
      const morality = states['morality'] as Record<string, unknown> | undefined
      const reputation = states['reputation'] as Record<string, unknown> | undefined
      const moralValue = (morality?.value as number) ?? 0
      const fame = (reputation?.fame as number) ?? 0
      return moralValue > 80 && fame > 60
    },
    handler: (e, _states) => [
      {
        targetSystemId: 'social-values',
        action: 'modify',
        params: { valueShiftDelta: 15 },
        sourceEventId: e.id,
      },
      {
        targetSystemId: 'legal',
        action: 'modify',
        params: { enforcementDelta: 5 },
        sourceEventId: e.id,
      },
    ],
    priority: 12,
    cooldownRounds: 10,
  })

  // 规则8：魔王降临 → 极恶+高战力 → 社会价值观恶偏移
  rules.push({
    id: 'demon-lord-values',
    eventTypePattern: '*',
    condition: () => true,
    dataCondition: (states) => {
      const morality = states['morality'] as Record<string, unknown> | undefined
      const combatPower = states['combat-power'] as Record<string, unknown> | undefined
      const moralValue = (morality?.value as number) ?? 0
      const mainStage = (combatPower?.mainStage as number) ?? 0
      return moralValue < -80 && mainStage >= 3
    },
    handler: (e, _states) => [
      {
        targetSystemId: 'social-values',
        action: 'modify',
        params: { valueShiftDelta: -20 },
        sourceEventId: e.id,
      },
      {
        targetSystemId: 'faction-dynamics',
        action: 'modify',
        params: { addContribution: 30 },
        sourceEventId: e.id,
      },
    ],
    priority: 12,
    cooldownRounds: 10,
  })

  // 规则9：继承危机 → HP 低且寿命将尽 → 派系动荡+执法下降
  rules.push({
    id: 'succession-crisis',
    eventTypePattern: '*',
    condition: () => true,
    dataCondition: (states) => {
      const health = states['health'] as Record<string, unknown> | undefined
      const lifespan = states['lifespan'] as Record<string, unknown> | undefined
      const charBase = states['character-base'] as Record<string, unknown> | undefined
      const hp = (health?.hp as number) ?? 100
      const maxAge = (lifespan?.maxAge as number) ?? 100
      const age = (charBase?.age as number) ?? 0
      return hp < 30 && age > 0 && (maxAge - age) < 5
    },
    handler: (e, _states) => [
      {
        targetSystemId: 'faction-dynamics',
        action: 'modify',
        params: { addContribution: 25 },
        sourceEventId: e.id,
      },
      {
        targetSystemId: 'legal',
        action: 'modify',
        params: { enforcementDelta: -10 },
        sourceEventId: e.id,
      },
    ],
    priority: 14,
    cooldownRounds: 8,
  })

  // 规则10：天选之人 → 高幸运+高信仰 → 天象祝福+人口增长
  rules.push({
    id: 'chosen-one-blessing',
    eventTypePattern: '*',
    condition: () => true,
    dataCondition: (states) => {
      const luck = states['luck'] as Record<string, unknown> | undefined
      const faith = states['faith'] as Record<string, unknown> | undefined
      const luckValue = (luck?.luck as number) ?? 0
      const devotion = (faith?.devotionLevel as number) ?? 0
      return luckValue > 8 && devotion > 80
    },
    handler: (e, _states) => [
      {
        targetSystemId: 'celestial',
        action: 'modify',
        params: { triggerBlessing: true },
        sourceEventId: e.id,
      },
      {
        targetSystemId: 'population',
        action: 'modify',
        params: { growthRate: 0.05 },
        sourceEventId: e.id,
      },
    ],
    priority: 10,
    cooldownRounds: 15,
  })

  // 规则11：文明推手 → 高心智+高科技 → 科技推进+教育提升
  rules.push({
    id: 'civilization-driver',
    eventTypePattern: '*',
    condition: () => true,
    dataCondition: (states) => {
      const charBase = states['character-base'] as Record<string, unknown> | undefined
      const cultureTech = states['culture-tech'] as Record<string, unknown> | undefined
      const current = charBase?.current as Record<string, number> | undefined
      const mind = current?.mind ?? 0
      const techProgress = (cultureTech?.techProgress as number) ?? 0
      return mind > 8 && techProgress > 0.5
    },
    handler: (e, _states) => [
      {
        targetSystemId: 'culture-tech',
        action: 'modify',
        params: { techProgressDelta: 0.1 },
        sourceEventId: e.id,
      },
      {
        targetSystemId: 'education',
        action: 'modify',
        params: { literacyRateDelta: 2 },
        sourceEventId: e.id,
      },
    ],
    priority: 8,
    cooldownRounds: 12,
  })

  return rules
}

// ============================================================
// WorldEventBus（简化版）
// ============================================================

export class WorldEventBus {
  private rules: CrossDomainRule[] = []
  private eventHistory: DomainEvent[] = []
  /** 规则冷却追踪：ruleId → 上次触发的回合号 */
  private cooldowns: Record<string, number> = {}
  /** 当前回合号（由 dispatch 调用方传入） */
  private currentRound = 0

  constructor() {
    this.rules = registerAllRules()
    this.rules.sort((a, b) => b.priority - a.priority)
  }

  recordEvent(event: DomainEvent): void {
    this.eventHistory.push(event)
    if (this.eventHistory.length > 500) {
      this.eventHistory = this.eventHistory.slice(-500)
    }
  }

  /**
   * 触发事件并执行所有匹配规则
   *
   * @param event - 域事件（宏观事件或每轮合成的批次事件）
   * @param subsystemStates - 子系统数据快照（用于 dataCondition 判定）
   * @param round - 当前回合号（用于冷却追踪）
   * @returns 所有匹配规则产出的子系统变更指令
   */
  dispatch(
    event: DomainEvent,
    subsystemStates?: Record<string, unknown>,
    round?: number,
  ): SubsystemInstruction[] {
    this.recordEvent(event)

    const currentRound = round ?? this.currentRound
    if (round !== undefined) {
      this.currentRound = round
    }

    const { instructions, cooldowns } = evaluateCrossDomainDispatch({
      event,
      subsystemStates,
      round: currentRound,
      cooldowns: this.cooldowns,
    })
    this.cooldowns = cooldowns
    return instructions
  }

  getCooldowns(): Record<string, number> {
    return { ...this.cooldowns }
  }

  setCooldowns(cooldowns: Record<string, number>): void {
    this.cooldowns = { ...cooldowns }
  }

  /**
   * 将 SubsystemInstruction[] 转为 SubSystemChanges[]
   * 供 orchestrator 的 applyRoundChanges 使用
   */
  static toSubSystemChanges(
    instructions: SubsystemInstruction[],
    sourceEventId: string,
  ): SubSystemChanges[] {
    return instructions.map((inst) => ({
      id: inst.targetSystemId,
      description: `跨域联动: ${inst.action} (来源事件: ${sourceEventId})`,
      changes: inst.params,
    }))
  }

  getEventHistory(limit?: number): DomainEvent[] {
    if (limit) return this.eventHistory.slice(-limit)
    return [...this.eventHistory]
  }

  getRuleCount(): number {
    return this.rules.length
  }

  reset(): void {
    this.eventHistory = []
    this.cooldowns = {}
    this.currentRound = 0
  }
}

