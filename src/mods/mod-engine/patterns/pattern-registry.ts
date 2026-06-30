/**
 * @module pattern-registry.ts
 * @description 统一模式管理层 - 模式注册表实现
 * @mod mod-engine
 *
 * 负责管理所有模式实例的注册、注销和查询。
 */

import type {
  IPattern,
  IPatternRegistry,
  PatternCategory,
  PatternMatchResultWithMeta,
} from './pattern-types'

/**
 * 模式注册表实现
 *
 * 使用 Map 存储模式实例，提供分类索引以加速查询。
 */
export class PatternRegistry implements IPatternRegistry {
  /** 模式存储 (id -> pattern) */
  private patterns: Map<string, IPattern> = new Map()

  /** 分类索引 (category -> Set<id>) */
  private categoryIndex: Map<PatternCategory, Set<string>> = new Map()

  /**
   * 注册模式
   */
  register(pattern: IPattern): void {
    if (this.patterns.has(pattern.id)) {
      console.warn(`[PatternRegistry] Pattern ${pattern.id} already registered, skipping`)
      return
    }

    this.patterns.set(pattern.id, pattern)

    // 更新分类索引
    if (!this.categoryIndex.has(pattern.category)) {
      this.categoryIndex.set(pattern.category, new Set())
    }
    this.categoryIndex.get(pattern.category)!.add(pattern.id)
  }

  /**
   * 批量注册模式
   */
  registerAll(patterns: IPattern[]): void {
    for (const pattern of patterns) {
      this.register(pattern)
    }
  }

  /**
   * 注销模式
   */
  unregister(id: string): void {
    const pattern = this.patterns.get(id)
    if (!pattern) return

    this.patterns.delete(id)
    this.categoryIndex.get(pattern.category)?.delete(id)
  }

  /**
   * 获取指定ID的模式
   */
  get(id: string): IPattern | undefined {
    return this.patterns.get(id)
  }

  /**
   * 获取指定分类的所有模式（按优先级降序）
   */
  getByCategory(category: PatternCategory): IPattern[] {
    const ids = this.categoryIndex.get(category)
    if (!ids) return []

    return Array.from(ids)
      .map(id => this.patterns.get(id))
      .filter((p): p is IPattern => p !== undefined)
      .sort((a, b) => b.priority - a.priority)
  }

  /**
   * 获取所有已注册的模式
   */
  getAll(): IPattern[] {
    return Array.from(this.patterns.values())
  }

  /**
   * 获取所有分类
   */
  getCategories(): PatternCategory[] {
    return Array.from(this.categoryIndex.keys())
  }

  /**
   * 查找所有匹配的模式
   */
  findMatches(text: string, category?: PatternCategory): PatternMatchResultWithMeta[] {
    const patternsToCheck = category
      ? this.getByCategory(category)
      : this.getAll()

    const results: PatternMatchResultWithMeta[] = []

    for (const pattern of patternsToCheck) {
      const result = pattern.match(text)
      if (result.matched) {
        results.push({
          ...result,
          patternId: pattern.id,
          category: pattern.category,
          priority: pattern.priority,
        })
      }
    }

    // 按置信度降序，然后按优先级降序排序
    return results.sort((a, b) => {
      if (b.confidence !== a.confidence) {
        return b.confidence - a.confidence
      }
      return b.priority - a.priority
    })
  }

  /**
   * 查找首个匹配的模式
   */
  findFirstMatch(text: string, category?: PatternCategory): PatternMatchResultWithMeta | null {
    const patternsToCheck = category
      ? this.getByCategory(category)
      : this.getAll()

    // 按优先级降序遍历
    const sorted = category
      ? patternsToCheck
      : Array.from(patternsToCheck).sort((a, b) => b.priority - a.priority)

    for (const pattern of sorted) {
      const result = pattern.match(text)
      if (result.matched) {
        return {
          ...result,
          patternId: pattern.id,
          category: pattern.category,
          priority: pattern.priority,
        }
      }
    }

    return null
  }

  /**
   * 测试指定分类是否匹配
   */
  testCategory(text: string, category: PatternCategory): boolean {
    const patterns = this.getByCategory(category)
    return patterns.some(p => p.test(text))
  }

  /**
   * 获取注册表统计信息
   */
  getStats(): {
    totalPatterns: number
    byCategory: Record<PatternCategory, number>
  } {
    const byCategory: Record<PatternCategory, number> = {
      relationship: 0,
      event: 0,
      importance: 0,
      closure: 0,
      forgetting: 0,
      parsing: 0,
      direction: 0,
    }

    for (const [category, ids] of this.categoryIndex.entries()) {
      byCategory[category] = ids.size
    }

    return {
      totalPatterns: this.patterns.size,
      byCategory,
    }
  }

  /**
   * 清空所有注册的模式
   */
  clear(): void {
    this.patterns.clear()
    this.categoryIndex.clear()
  }
}
