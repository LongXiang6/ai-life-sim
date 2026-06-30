/**
 * @module importance-patterns.ts
 * @description 统一模式管理层 - 重要性评估模式
 * @mod mod-engine
 *
 * 评估 AI 叙事文本的重要性等级。
 */

import { KeywordPattern } from './base-pattern'

// ============================================================
// 重要性关键词常量
// ============================================================

/** 高重要性关键词 */
const HIGH_KEYWORDS = [
  '死亡', '阵亡', '牺牲', '战死', '去世',
  '突破', '觉醒', '飞升', '入魔', '涅槃',
  '背叛', '复仇', '决裂', '血战', '大捷',
  '结婚', '生子', '诞子', '继承', '登基',
  '发现', '发明', '创造', '毁灭', '拯救',
  '契约', '诅咒', '预言', '命运', '天机',
  '重伤', '濒死', '重生', '转世', '升仙',
]

/** 中重要性关键词 */
const NORMAL_KEYWORDS = [
  '相识', '结识', '成为朋友', '结盟', '合作',
  '迁移', '旅行', '远行', '搬迁', '抵达',
  '学习', '拜师', '收徒', '传授', '习得',
  '晋升', '升职', '任职', '离职', '转行',
  '获得', '得到', '发现', '接收', '赠与',
  '经商', '交易', '出售', '购买', '投资',
  '冲突', '争吵', '不和', '矛盾', '分歧',
  '和解', '和好', '原谅', '释怀', '放下',
]

/** 低重要性关键词 */
const LOW_KEYWORDS = [
  '日常', '生活', '吃饭', '睡觉', '散步',
  '看书', '练习', '修炼', '打坐', '冥想',
  '逛街', '闲逛', '漫步', '休整', '调整',
  '整理', '打扫', '清洗', '维护', '检查',
  '闲聊', '闲谈', '应酬', '寒暄', '客套',
  '重复', '日复一日', '一如既往', '平淡', '寻常',
]

// ============================================================
// 重要性结果类型
// ============================================================

export interface ImportanceResult {
  [key: string]: unknown
  importance: 'HIGH' | 'NORMAL' | 'LOW'
  score: number
  matchedKeywords: string[],
}

// ============================================================
// 高重要性模式
// ============================================================

export class HighImportancePattern extends KeywordPattern {
  constructor() {
    super(
      'importance.high',
      'importance',
      10,
      '检测高重要性事件：死亡、突破、背叛等重大事件',
      HIGH_KEYWORDS,
    )
  }

  protected extractData(match: RegExpMatchArray): Record<string, unknown> {
    const matchedKeywords = this.extractMatchedKeywords(match.input ?? '')
    return {
      importance: 'HIGH',
      score: matchedKeywords.length * 3,
      matchedKeyword: match[0] || '',
      matchedKeywords,
    } as ImportanceResult
  }

  protected calculateConfidence(_match: RegExpMatchArray, text: string): number {
    const matchedCount = this.extractMatchedKeywords(text).length
    return Math.min(1.0, matchedCount * 0.3)
  }
}

// ============================================================
// 中重要性模式
// ============================================================

export class NormalImportancePattern extends KeywordPattern {
  constructor() {
    super(
      'importance.normal',
      'importance',
      8,
      '检测中重要性事件：人际关系变化、职业变动等',
      NORMAL_KEYWORDS,
    )
  }

  protected extractData(match: RegExpMatchArray): Record<string, unknown> {
    const matchedKeywords = this.extractMatchedKeywords(match.input ?? '')
    return {
      importance: 'NORMAL',
      score: matchedKeywords.length * 2,
      matchedKeyword: match[0] || '',
      matchedKeywords,
    } as ImportanceResult
  }

  protected calculateConfidence(_match: RegExpMatchArray, text: string): number {
    const matchedCount = this.extractMatchedKeywords(text).length
    return Math.min(0.9, matchedCount * 0.2)
  }
}

// ============================================================
// 低重要性模式
// ============================================================

export class LowImportancePattern extends KeywordPattern {
  constructor() {
    super(
      'importance.low',
      'importance',
      6,
      '检测低重要性事件：日常流水、重复训练等',
      LOW_KEYWORDS,
    )
  }

  protected extractData(match: RegExpMatchArray): Record<string, unknown> {
    const matchedKeywords = this.extractMatchedKeywords(match.input ?? '')
    return {
      importance: 'LOW',
      score: matchedKeywords.length,
      matchedKeyword: match[0] || '',
      matchedKeywords,
    } as ImportanceResult
  }

  protected calculateConfidence(_match: RegExpMatchArray, text: string): number {
    const matchedCount = this.extractMatchedKeywords(text).length
    return Math.min(0.8, matchedCount * 0.15)
  }
}

// ============================================================
// 综合重要性评估器
// ============================================================

export class ImportanceEvaluator {
  private highPattern: HighImportancePattern
  private normalPattern: NormalImportancePattern
  private lowPattern: LowImportancePattern

  constructor() {
    this.highPattern = new HighImportancePattern()
    this.normalPattern = new NormalImportancePattern()
    this.lowPattern = new LowImportancePattern()
  }

  /**
   * 评估叙事重要性
   *
   * 策略：最高命中等级制
   *   - 只要命中一个HIGH关键词 → HIGH
   *   - 命中NORMAL关键词（且无HIGH） → NORMAL
   *   - 什么都没有命中 → LOW
   */
  evaluate(narrative: string): ImportanceResult {
    // 检查高重要性（优先级最高）
    if (this.highPattern.test(narrative)) {
      const data = this.highPattern.extract(narrative)
      return {
        importance: 'HIGH',
        score: (data?.matchedKeywords as string[])?.length * 3 || 3,
        matchedKeywords: (data?.matchedKeywords as string[]) || [],
      }
    }

    // 检查中重要性
    if (this.normalPattern.test(narrative)) {
      const data = this.normalPattern.extract(narrative)
      return {
        importance: 'NORMAL',
        score: (data?.matchedKeywords as string[])?.length * 2 || 2,
        matchedKeywords: (data?.matchedKeywords as string[]) || [],
      }
    }

    // 默认为低重要性
    if (this.lowPattern.test(narrative)) {
      const data = this.lowPattern.extract(narrative)
      return {
        importance: 'LOW',
        score: (data?.matchedKeywords as string[])?.length || 1,
        matchedKeywords: (data?.matchedKeywords as string[]) || [],
      }
    }

    return {
      importance: 'LOW',
      score: 0,
      matchedKeywords: [],
    }
  }
}

// ============================================================
// 导出所有重要性模式
// ============================================================

export const IMPORTANCE_PATTERNS: KeywordPattern[] = [
  new HighImportancePattern(),
  new NormalImportancePattern(),
  new LowImportancePattern(),
]

/** 单例评估器 */
export const importanceEvaluator = new ImportanceEvaluator()

