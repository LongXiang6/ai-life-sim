/**
 * @module pattern-manager.ts
 * @description 统一模式管理层 - 模式管理器单例
 * @mod mod-engine
 *
 * 提供统一的模式管理入口，封装注册表和工厂。
 */

import type {
  PatternCategory,
  PatternMatchResultWithMeta,
  IPattern
} from './pattern-types'

import { PatternRegistry } from './pattern-registry'
import { PatternFactory } from './pattern-factory'
import { importanceEvaluator } from './importance-patterns'
import { closureDetector } from './closure-patterns'
import { forgettingAnalyzer } from './forgetting-patterns'

/**
 * 模式管理器
 *
 * 单例模式，提供统一的模式管理 API。
 */
class PatternManager {
  private static instance: PatternManager
  private registry: PatternRegistry
  private factory: PatternFactory

  private constructor() {
    this.registry = new PatternRegistry()
    this.factory = new PatternFactory(this.registry)
    this.factory.registerAllPatterns()
  }

  /**
   * 获取单例实例
   */
  static getInstance(): PatternManager {
    if (!PatternManager.instance) {
      PatternManager.instance = new PatternManager()
    }
    return PatternManager.instance
  }

  // ============================================================
  // 通用查询方法
  // ============================================================

  /**
   * 查找所有匹配的模式
   */
  findMatches(text: string, category?: PatternCategory): PatternMatchResultWithMeta[] {
    try {
      return this.registry.findMatches(text, category)
    } catch (error) {
      console.warn('[PatternManager] findMatches 失败:', error)
      return []
    }
  }

  /**
   * 查找首个匹配的模式
   */
  findFirstMatch(text: string, category?: PatternCategory): PatternMatchResultWithMeta | null {
    try {
      return this.registry.findFirstMatch(text, category)
    } catch (error) {
      console.warn('[PatternManager] findFirstMatch 失败:', error)
      return null
    }
  }

  /**
   * 获取指定ID的模式
   */
  getPattern(id: string): IPattern | undefined {
    return this.registry.get(id)
  }

  /**
   * 获取指定分类的所有模式
   */
  getPatternsByCategory(category: PatternCategory): IPattern[] {
    return this.registry.getByCategory(category)
  }

  /**
   * 获取注册表统计信息
   */
  getStats() {
    return this.registry.getStats()
  }

  // ============================================================
  // 便捷方法：重要性评估
  // ============================================================

  /**
   * 评估叙事重要性
   */
  evaluateImportance(narrative: string) {
    try {
      return importanceEvaluator.evaluate(narrative)
    } catch (error) {
      console.warn('[PatternManager] evaluateImportance 失败:', error)
      return { importance: 0, factors: [] }
    }
  }

  // ============================================================
  // 便捷方法：闭环检测
  // ============================================================

  /**
   * 检测叙事中的闭环
   */
  detectClosure(narrative: string) {
    try {
      return closureDetector.detect(narrative)
    } catch (error) {
      console.warn('[PatternManager] detectClosure 失败:', error)
      return { hasClosure: false, closures: [] }
    }
  }

  /**
   * 获取当前活跃的闭环类型
   */
  getActiveClosure() {
    return closureDetector.getActiveClosure()
  }

  /**
   * 重置闭环检测器
   */
  resetClosureDetector() {
    closureDetector.reset()
  }

  // ============================================================
  // 便捷方法：遗忘分析
  // ============================================================

  /**
   * 分析摘要是否应遗忘
   */
  analyzeForgetting(summary: string) {
    try {
      return forgettingAnalyzer.analyze(summary)
    } catch (error) {
      console.warn('[PatternManager] analyzeForgetting 失败:', error)
      return { shouldForget: false, reason: '', confidence: 0 }
    }
  }

  // ============================================================
  // 便捷方法：方向倾向检测
  // ============================================================

  // ============================================================
  // 便捷方法：人际关系提取
  // ============================================================

  /**
   * 从叙事中提取人际关系
   */
  extractRelationships(narrative: string) {
    try {
      const matches = this.findMatches(narrative, 'relationship')
      return matches.map(match => ({
        ...match.extractedData,
        confidence: match.confidence,
        patternId: match.patternId,
      }))
    } catch (error) {
      console.warn('[PatternManager] extractRelationships 失败:', error)
      return []
    }
  }

  // ============================================================
  // 管理方法
  // ============================================================

  /**
   * 注册自定义模式
   */
  registerPattern(pattern: IPattern): void {
    this.registry.register(pattern)
  }

  /**
   * 注销模式
   */
  unregisterPattern(id: string): void {
    this.registry.unregister(id)
  }

  /**
   * 清空所有模式
   */
  clear(): void {
    this.registry.clear()
  }

  /**
   * 重新初始化（清空并重新注册默认模式）
   */
  reinitialize(): void {
    this.registry.clear()
    this.factory.registerAllPatterns()
    closureDetector.reset()
  }
}

/** 导出单例 */
export const patternManager = PatternManager.getInstance()
