/**
 * @module forgetting-patterns.ts
 * @description 统一模式管理层 - 遗忘检测模式
 * @mod mod-engine
 *
 * 检测叙事中应遗忘的内容（重复事件、无意义日常等）。
 */

import { KeywordPattern } from './base-pattern'

// ============================================================
// 关键词常量
// ============================================================

/** 重大事件关键词（永不遗忘） */
const IMPORTANT_KEYWORDS = [
  '出生', '死亡', '结婚', '离婚', '生子', '丧亲',
  '继承', '登基', '退位', '篡位', '叛乱', '战争',
  '突破', '觉醒', '觉醒', '顿悟', '入魔', '陨落',
  '获得', '失去', '发现', '发明', '创造', '毁灭',
  '结盟', '背叛', '复仇', '救赎', '牺牲', '拯救',
  '晋升', '降职', '封爵', '贬谪', '流放', '召回',
  '契约', '誓言', '诅咒', '祝福', '预言', '命运',
]

/** 人物关系关键词（永不遗忘） */
const RELATIONSHIP_KEYWORDS = [
  '相识', '结识', '成为朋友', '成为敌人', '结为', '订婚',
  '相爱', '分手', '和解', '决裂', '重逢', '离别',
  '收养', '认亲', '认祖', '认主', '收徒', '拜师',
  '救命', '恩人', '仇人', '宿敌', '挚友', '知己',
]

/** 日常小事关键词（可遗忘，但随机保留） */
const TRIVIAL_KEYWORDS = [
  '日常', '生活', '吃饭', '睡觉', '散步', '闲聊',
  '看书', '练习', '修炼', '打坐', '冥想', '休息',
  '逛街', '购物', '游玩', '散步', '闲逛', '漫步',
  '整理', '打扫', '清洗', '维护', '检查', '巡视',
  '重复', '日复一日', '一如既往', '平淡', '寻常',
]

/** 无意义重复模式 */
const REPETITIVE_PATTERNS = [
  /日复一日/,
  /一如既往/,
  /平淡无奇/,
  /重复着/,
  /每天/,
  /每日/,
  /照常/,
  /依旧/,
  /继续/,
]

// ============================================================
// 重大事件模式
// ============================================================

export class ImportantEventPattern extends KeywordPattern {
  constructor() {
    super(
      'forgetting.important',
      'forgetting',
      10,
      '检测重大事件关键词（永不遗忘）',
      IMPORTANT_KEYWORDS
    )
  }

  protected extractData(match: RegExpMatchArray): Record<string, unknown> {
    return {
      shouldForget: false,
      reason: 'important_event',
      matchedKeyword: match[0] || '',
      matchedKeywords: this.extractMatchedKeywords(match.input ?? ''),
    } as Record<string, unknown>
  }
}

// ============================================================
// 人物关系模式
// ============================================================

export class RelationshipPattern extends KeywordPattern {
  constructor() {
    super(
      'forgetting.relationship',
      'forgetting',
      9,
      '检测人物关系关键词（永不遗忘）',
      RELATIONSHIP_KEYWORDS
    )
  }

  protected extractData(match: RegExpMatchArray): Record<string, unknown> {
    return {
      shouldForget: false,
      reason: 'relationship',
      matchedKeyword: match[0] || '',
      matchedKeywords: this.extractMatchedKeywords(match.input ?? ''),
    } as Record<string, unknown>
  }
}

// ============================================================
// 日常小事模式
// ============================================================

export class TrivialPattern extends KeywordPattern {
  constructor() {
    super(
      'forgetting.trivial',
      'forgetting',
      6,
      '检测日常小事关键词（可遗忘）',
      TRIVIAL_KEYWORDS
    )
  }

  protected extractData(match: RegExpMatchArray): Record<string, unknown> {
    return {
      shouldForget: true,
      reason: 'trivial',
      matchedKeyword: match[0] || '',
      matchedKeywords: this.extractMatchedKeywords(match.input ?? ''),
    } as Record<string, unknown>
  }
}

// ============================================================
// 重复模式
// ============================================================

export class RepetitivePattern extends KeywordPattern {
  constructor() {
    // 构建重复模式正则
    const regex = new RegExp(REPETITIVE_PATTERNS.map(p => p.source).join('|'))
    super(
      'forgetting.repetitive',
      'forgetting',
      7,
      '检测无意义重复模式',
      [] // 空关键词列表，直接使用正则
    )
    // 覆盖正则
    Object.defineProperty(this, 'regex', { value: regex })
  }

  protected extractData(match: RegExpMatchArray): Record<string, unknown> {
    return {
      shouldForget: true,
      reason: 'repetitive',
      matchedPattern: match[0],
    }
  }
}

// ============================================================
// 遗忘分析器
// ============================================================

export interface ForgettingAnalysis {
  shouldForget: boolean
  reasons: Array<{
    type: 'important' | 'relationship' | 'trivial' | 'repetitive'
    keyword: string
  }>
}

export class ForgettingAnalyzer {
  private importantPattern: ImportantEventPattern
  private relationshipPattern: RelationshipPattern
  private trivialPattern: TrivialPattern
  private repetitivePattern: RepetitivePattern

  constructor() {
    this.importantPattern = new ImportantEventPattern()
    this.relationshipPattern = new RelationshipPattern()
    this.trivialPattern = new TrivialPattern()
    this.repetitivePattern = new RepetitivePattern()
  }

  /**
   * 分析摘要是否应遗忘
   *
   * 策略：
   *   1. 重大事件 → 永不遗忘
   *   2. 人物关系 → 永不遗忘
   *   3. 重复模式 → 应遗忘
   *   4. 日常小事 → 应遗忘（但调用方可能随机保留）
   *   5. 其他 → 保留
   */
  analyze(summary: string): ForgettingAnalysis {
    const reasons: ForgettingAnalysis['reasons'] = []

    // 检查重大事件（优先级最高）
    if (this.importantPattern.test(summary)) {
      const data = this.importantPattern.extract(summary)
      const keywords = (data?.matchedKeywords as string[]) || []
      return {
        shouldForget: false,
        reasons: keywords.map(k => ({ type: 'important' as const, keyword: k })),
      }
    }

    // 检查人物关系
    if (this.relationshipPattern.test(summary)) {
      const data = this.relationshipPattern.extract(summary)
      const keywords = (data?.matchedKeywords as string[]) || []
      return {
        shouldForget: false,
        reasons: keywords.map(k => ({ type: 'relationship' as const, keyword: k })),
      }
    }

    // 检查重复模式
    if (this.repetitivePattern.test(summary)) {
      const data = this.repetitivePattern.extract(summary)
      reasons.push({
        type: 'repetitive' as const,
        keyword: (data?.matchedPattern as string) || '',
      })
    }

    // 检查日常小事
    if (this.trivialPattern.test(summary)) {
      const data = this.trivialPattern.extract(summary)
      const keywords = (data?.matchedKeywords as string[]) || []
      reasons.push(...keywords.map(k => ({ type: 'trivial' as const, keyword: k })))
    }

    return {
      shouldForget: reasons.length > 0,
      reasons,
    }
  }
}

// ============================================================
// 导出所有遗忘检测模式
// ============================================================

export const FORGETTING_PATTERNS: KeywordPattern[] = [
  new ImportantEventPattern(),
  new RelationshipPattern(),
  new TrivialPattern(),
  new RepetitivePattern(),
]

/** 单例分析器 */
export const forgettingAnalyzer = new ForgettingAnalyzer()
