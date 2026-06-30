/**
 * @module closure-patterns.ts
 * @description 统一模式管理层 - 闭环检测模式
 * @mod mod-engine
 *
 * 检测叙事中的事件闭环（如战斗开始→结束、旅程出发→返回等）。
 */

import { CompoundPattern } from './base-pattern'

// ============================================================
// 闭环类型定义
// ============================================================

export type ClosureType = 'battle' | 'journey' | 'task' | 'relationship' | 'life_stage' | 'none'

export interface ClosureResult {
  detected: boolean
  type: ClosureType
  isStart: boolean
  isEnd: boolean,
}

// ============================================================
// 战斗闭环模式
// ============================================================

export class BattleClosurePattern extends CompoundPattern {
  constructor() {
    super(
      'closure.battle',
      'closure',
      10,
      '检测战斗闭环：战斗开始→胜利/失败/撤退',
      /战斗|开战|出击|交[战锋]|厮杀|决战/,
      /胜利|凯旋|战败|撤退|击退|歼灭|平定|终[结战]|结束.*(战斗|战役|战争)/,
    )
  }

  protected extractData(match: RegExpMatchArray): Record<string, unknown> {
    return {
      type: 'battle',
      isStart: true,
      isEnd: false,
      matchedText: match[0],
    }
  }
}

// ============================================================
// 旅程闭环模式
// ============================================================

export class JourneyClosurePattern extends CompoundPattern {
  constructor() {
    super(
      'closure.journey',
      'closure',
      9,
      '检测旅程闭环：出发→抵达/返回',
      /出发|启程|动身|踏上|前往|离家|出行/,
      /抵达|到达|返回|归来|回到|到达.*(目的地|终点)/,
    )
  }

  protected extractData(match: RegExpMatchArray): Record<string, unknown> {
    return {
      type: 'journey',
      isStart: true,
      isEnd: false,
      matchedText: match[0],
    }
  }
}

// ============================================================
// 任务闭环模式
// ============================================================

export class TaskClosurePattern extends CompoundPattern {
  constructor() {
    super(
      'closure.task',
      'closure',
      8,
      '检测任务闭环：接受任务→完成/放弃',
      /接受.*(任务|委托|请求)|答应|承诺|约定/,
      /完成.*(任务|委托|请求)|兑现|实现.*(承诺|约定)/,
    )
  }

  protected extractData(match: RegExpMatchArray): Record<string, unknown> {
    return {
      type: 'task',
      isStart: true,
      isEnd: false,
      matchedText: match[0],
    }
  }
}

// ============================================================
// 关系闭环模式
// ============================================================

export class RelationshipClosurePattern extends CompoundPattern {
  constructor() {
    super(
      'closure.relationship',
      'closure',
      8,
      '检测关系闭环：相识→成为朋友/敌人/决裂',
      /相识|结识|认识|遇见|相遇/,
      /成为.*(朋友|敌人|师徒|伴侣|夫妻)|结盟|决裂|和解|订婚/,
    )
  }

  protected extractData(match: RegExpMatchArray): Record<string, unknown> {
    return {
      type: 'relationship',
      isStart: true,
      isEnd: false,
      matchedText: match[0],
    }
  }
}

// ============================================================
// 生命阶段闭环模式
// ============================================================

export class LifeStageClosurePattern extends CompoundPattern {
  constructor() {
    super(
      'closure.life_stage',
      'closure',
      7,
      '检测生命阶段闭环：年幼→成年/突破',
      /年幼|童年|少年|青年|壮年|中年|老年|暮年/,
      /成年|及冠|及笄|弱冠|而立|不惑|知天命/,
    )
  }

  protected extractData(match: RegExpMatchArray): Record<string, unknown> {
    return {
      type: 'life_stage',
      isStart: true,
      isEnd: false,
      matchedText: match[0],
    }
  }
}

// ============================================================
// 综合闭环检测器
// ============================================================

export class ClosureDetector {
  private battlePattern: BattleClosurePattern
  private journeyPattern: JourneyClosurePattern
  private taskPattern: TaskClosurePattern
  private relationshipPattern: RelationshipClosurePattern
  private lifeStagePattern: LifeStageClosurePattern

  /** 当前活跃的闭环类型 */
  private activeClosure: ClosureType = 'none'

  constructor() {
    this.battlePattern = new BattleClosurePattern()
    this.journeyPattern = new JourneyClosurePattern()
    this.taskPattern = new TaskClosurePattern()
    this.relationshipPattern = new RelationshipClosurePattern()
    this.lifeStagePattern = new LifeStageClosurePattern()
  }

  /**
   * 检测叙事中的闭环
   *
   * @param narrative 叙事文本
   * @returns 闭环检测结果
   */
  detect(narrative: string): ClosureResult {
    // 检查当前活跃的闭环是否结束
    if (this.activeClosure !== 'none') {
      const pattern = this.getPatternByType(this.activeClosure)
      if (pattern && pattern.testEnd(narrative)) {
        const closed = this.activeClosure
        this.activeClosure = 'none'
        return { detected: true, type: closed, isStart: false, isEnd: true }
      }
      return { detected: false, type: this.activeClosure, isStart: false, isEnd: false }
    }

    // 检查是否有新的闭环开始
    const patterns: [ClosureType, CompoundPattern][] = [
      ['battle', this.battlePattern],
      ['journey', this.journeyPattern],
      ['task', this.taskPattern],
      ['relationship', this.relationshipPattern],
      ['life_stage', this.lifeStagePattern],
    ]

    for (const [type, pattern] of patterns) {
      if (pattern.testStart(narrative)) {
        this.activeClosure = type
        // 检查是否在同轮内完成闭环
        if (pattern.testEnd(narrative)) {
          this.activeClosure = 'none'
          return { detected: true, type, isStart: true, isEnd: true }
        }
        return { detected: false, type, isStart: true, isEnd: false }
      }
    }

    return { detected: false, type: 'none', isStart: false, isEnd: false }
  }

  private getPatternByType(type: ClosureType): CompoundPattern | null {
    switch (type) {
      case 'battle': return this.battlePattern
      case 'journey': return this.journeyPattern
      case 'task': return this.taskPattern
      case 'relationship': return this.relationshipPattern
      case 'life_stage': return this.lifeStagePattern
      default: return null
    }
  }

  /** 获取当前活跃的闭环类型 */
  getActiveClosure(): ClosureType {
    return this.activeClosure
  }

  /** 重置检测器状态 */
  reset(): void {
    this.activeClosure = 'none'
  }
}

// ============================================================
// 导出所有闭环模式
// ============================================================

export const CLOSURE_PATTERNS: CompoundPattern[] = [
  new BattleClosurePattern(),
  new JourneyClosurePattern(),
  new TaskClosurePattern(),
  new RelationshipClosurePattern(),
  new LifeStageClosurePattern(),
]

/** 单例检测器 */
export const closureDetector = new ClosureDetector()

