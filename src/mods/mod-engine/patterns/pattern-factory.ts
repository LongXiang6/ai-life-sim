/**
 * @module pattern-factory.ts
 * @description 统一模式管理层 - 模式工厂实现
 * @mod mod-engine
 *
 * 负责创建和注册所有模式实例。
 */

import type { IPatternFactory, IPatternRegistry, IPattern } from './pattern-types'

import { RELATIONSHIP_PATTERNS } from './relationship-patterns'
import { IMPORTANCE_PATTERNS } from './importance-patterns'
import { CLOSURE_PATTERNS } from './closure-patterns'
import { FORGETTING_PATTERNS } from './forgetting-patterns'

/**
 * 模式工厂实现
 *
 * 创建各类模式实例并注册到注册表。
 */
export class PatternFactory implements IPatternFactory {
  constructor(private registry: IPatternRegistry) {}

  /**
   * 创建关系模式集合
   */
  createRelationshipPatterns(): IPattern[] {
    return [...RELATIONSHIP_PATTERNS]
  }

  /**
   * 创建事件模式集合
   */
  createEventPatterns(): IPattern[] {
    // 事件模式已集成到其他模式中，这里返回空数组
    // 未来可扩展独立的事件提取模式
    return []
  }

  /**
   * 创建重要性模式集合
   */
  createImportancePatterns(): IPattern[] {
    return [...IMPORTANCE_PATTERNS]
  }

  /**
   * 创建闭环检测模式集合
   */
  createClosurePatterns(): IPattern[] {
    return [...CLOSURE_PATTERNS]
  }

  /**
   * 创建遗忘检测模式集合
   */
  createForgettingPatterns(): IPattern[] {
    return [...FORGETTING_PATTERNS]
  }

  /**
   * 创建解析策略模式集合
   */
  createParsingPatterns(): IPattern[] {
    // 未来可迁移到模式管理层
    return []
  }

  /**
   * 批量注册所有模式到注册表
   */
  registerAllPatterns(): void {
    const allPatterns = [
      ...this.createRelationshipPatterns(),
      ...this.createEventPatterns(),
      ...this.createImportancePatterns(),
      ...this.createClosurePatterns(),
      ...this.createForgettingPatterns(),
      ...this.createParsingPatterns(),
    ]

    for (const pattern of allPatterns) {
      this.registry.register(pattern)
    }
  }
}
