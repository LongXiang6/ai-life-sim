/**
 * @module base-pattern.ts
 * @description 统一模式管理层 - 基础模式抽象类
 * @mod mod-engine
 *
 * 提供所有具体模式类的公共基类，封装通用的匹配逻辑。
 */

import type { IPattern, PatternMatchResult, PatternCategory } from './pattern-types'

/**
 * 基础模式抽象类
 *
 * 所有具体模式类应继承此类，实现 extractData 方法。
 * 可选重写 calculateConfidence 以自定义置信度计算。
 */
export abstract class BasePattern implements IPattern {
  readonly id: string
  readonly category: PatternCategory
  readonly priority: number
  readonly description: string
  protected readonly regex: RegExp

  constructor(
    id: string,
    category: PatternCategory,
    priority: number,
    description: string,
    regex: RegExp
  ) {
    this.id = id
    this.category = category
    this.priority = priority
    this.description = description
    this.regex = regex
  }

  /**
   * 执行匹配
   */
  match(text: string): PatternMatchResult {
    const match = text.match(this.regex)
    if (!match) {
      return { matched: false, confidence: 0 }
    }

    return {
      matched: true,
      confidence: this.calculateConfidence(match, text),
      groups: match.slice(1),
      extractedData: this.extractData(match),
    }
  }

  /**
   * 快速测试是否匹配
   */
  test(text: string): boolean {
    return this.regex.test(text)
  }

  /**
   * 提取结构化数据
   */
  extract(text: string): Record<string, unknown> | null {
    const match = text.match(this.regex)
    return match ? this.extractData(match) : null
  }

  /**
   * 计算置信度（可被子类重写）
   *
   * 默认实现返回 1.0，子类可根据匹配质量返回不同值。
   */
  protected calculateConfidence(_match: RegExpMatchArray, _text: string): number {
    return 1.0
  }

  /**
   * 提取结构化数据（必须被子类实现）
   *
   * @param match 正则匹配结果
   * @returns 提取的结构化数据
   */
  protected abstract extractData(match: RegExpMatchArray): Record<string, unknown>
}

/**
 * 关键词模式抽象类
 *
 * 用于基于关键词列表的简单匹配场景。
 */
export abstract class KeywordPattern extends BasePattern {
  protected readonly keywords: string[]

  constructor(
    id: string,
    category: PatternCategory,
    priority: number,
    description: string,
    keywords: string[]
  ) {
    // 构建关键词正则
    const escapedKeywords = keywords.map(kw => kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    const regex = new RegExp(escapedKeywords.join('|'))

    super(id, category, priority, description, regex)
    this.keywords = keywords
  }

  /**
   * 计算置信度（基于关键词命中数量）
   */
  protected calculateConfidence(_match: RegExpMatchArray, text: string): number {
    let count = 0
    for (const keyword of this.keywords) {
      if (text.includes(keyword)) count++
    }
    return Math.min(1.0, count * 0.3)
  }

  /**
   * 提取匹配的关键词列表
   */
  protected extractMatchedKeywords(text: string): string[] {
    return this.keywords.filter(kw => text.includes(kw))
  }
}

/**
 * 复合模式抽象类
 *
 * 用于需要同时检测开始和结束模式的场景（如闭环检测）。
 */
export abstract class CompoundPattern extends BasePattern {
  protected readonly startRegex: RegExp
  protected readonly endRegex: RegExp

  constructor(
    id: string,
    category: PatternCategory,
    priority: number,
    description: string,
    startRegex: RegExp,
    endRegex: RegExp
  ) {
    // 使用 startRegex 作为主 regex
    super(id, category, priority, description, startRegex)
    this.startRegex = startRegex
    this.endRegex = endRegex
  }

  /**
   * 检测是否同时匹配开始和结束模式
   */
  testBoth(text: string): boolean {
    return this.startRegex.test(text) && this.endRegex.test(text)
  }

  /**
   * 检测是否仅匹配开始模式
   */
  testStart(text: string): boolean {
    return this.startRegex.test(text) && !this.endRegex.test(text)
  }

  /**
   * 检测是否仅匹配结束模式
   */
  testEnd(text: string): boolean {
    return !this.startRegex.test(text) && this.endRegex.test(text)
  }
}
