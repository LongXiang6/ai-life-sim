/**
 * @module pattern-types.ts
 * @description 统一模式管理层 - 核心接口和类型定义
 * @mod mod-engine
 *
 * 设计目标：
 *   提供统一的正则表达式和模式匹配抽象层，
 *   解决多个子系统中模式定义分散、缺乏统一管理的问题。
 *
 * 核心概念：
 *   - IPattern: 统一的模式接口
 *   - PatternCategory: 模式分类枚举
 *   - IPatternRegistry: 模式注册表接口
 *   - IPatternFactory: 模式工厂接口
 */

// ============================================================
// 模式分类
// ============================================================

/**
 * 模式分类枚举
 */
export type PatternCategory =
  | 'relationship'   // 人际关系模式
  | 'event'          // 事件提取模式
  | 'importance'     // 重要性评估模式
  | 'closure'        // 闭环检测模式
  | 'forgetting'     // 遗忘检测模式
  | 'parsing'       // 解析策略模式
  | 'direction'      // 方向倾向模式

// ============================================================
// 匹配结果
// ============================================================

/**
 * 模式匹配结果
 */
export interface PatternMatchResult {
  /** 是否匹配成功 */
  matched: boolean
  /** 置信度 (0-1) */
  confidence: number
  /** 提取的结构化数据 */
  extractedData?: Record<string, unknown>
  /** 正则捕获组 */
  groups?: string[]
  /** 匹配的模式ID */
  patternId?: string
  /** 模式分类 */
  category?: PatternCategory
}

/**
 * 批量匹配结果（带元信息）
 */
export interface PatternMatchResultWithMeta extends PatternMatchResult {
  patternId: string
  category: PatternCategory
  priority: number,
}

// ============================================================
// 模式接口
// ============================================================

/**
 * 统一模式接口
 */
export interface IPattern {
  /** 模式唯一标识 */
  readonly id: string
  /** 模式分类 */
  readonly category: PatternCategory
  /** 优先级（同分类内排序） */
  readonly priority: number
  /** 模式描述 */
  readonly description: string

  /**
   * 执行匹配
   * @param text 待匹配文本
   * @returns 匹配结果
   */
  match(text: string): PatternMatchResult

  /**
   * 快速测试是否匹配（不返回详细信息）
   * @param text 待匹配文本
   * @returns 是否匹配
   */
  test(text: string): boolean

  /**
   * 提取结构化数据
   * @param text 待匹配文本
   * @returns 提取的数据，匹配失败返回 null
   */
  extract(text: string): Record<string, unknown> | null
}

// ============================================================
// 注册表接口
// ============================================================

/**
 * 模式注册表接口
 */
export interface IPatternRegistry {
  /**
   * 注册模式
   * @param pattern 模式实例
   */
  register(pattern: IPattern): void

  /**
   * 注销模式
   * @param id 模式ID
   */
  unregister(id: string): void

  /**
   * 获取指定ID的模式
   * @param id 模式ID
   * @returns 模式实例，不存在返回 undefined
   */
  get(id: string): IPattern | undefined

  /**
   * 获取指定分类的所有模式
   * @param category 模式分类
   * @returns 模式数组（按优先级降序）
   */
  getByCategory(category: PatternCategory): IPattern[]

  /**
   * 查找所有匹配的模式
   * @param text 待匹配文本
   * @param category 可选分类过滤
   * @returns 匹配结果数组（按置信度降序）
   */
  findMatches(text: string, category?: PatternCategory): PatternMatchResultWithMeta[]
}

// ============================================================
// 工厂接口
// ============================================================

/**
 * 模式工厂接口
 */
export interface IPatternFactory {
  /** 创建关系模式集合 */
  createRelationshipPatterns(): IPattern[]
  /** 创建事件模式集合 */
  createEventPatterns(): IPattern[]
  /** 创建重要性模式集合 */
  createImportancePatterns(): IPattern[]
  /** 创建闭环检测模式集合 */
  createClosurePatterns(): IPattern[]
  /** 创建遗忘检测模式集合 */
  createForgettingPatterns(): IPattern[]
  /** 创建解析策略模式集合 */
  createParsingPatterns(): IPattern[]

  /**
   * 批量注册所有模式到注册表
   */
  registerAllPatterns(): void
}

// ============================================================
// 测试接口
// ============================================================

/**
 * 模式测试用例
 */
export interface PatternTestCase {
  /** 输入文本 */
  input: string
  /** 期望是否匹配 */
  expectedMatch: boolean
  /** 期望的提取数据（可选） */
  expectedData?: Record<string, unknown>
}

/**
 * 测试结果
 */
export interface PatternTestResult {
  /** 通过的测试数 */
  passed: number
  /** 失败的测试数 */
  failed: number
  /** 详细结果 */
  results: Array<{
    input: string
    passed: boolean
    error?: string
  }>
}

// ============================================================
// 常量
// ============================================================

/** 分类显示名称 */
export const CATEGORY_LABELS: Record<PatternCategory, string> = {
  relationship: '人际关系',
  event: '事件提取',
  importance: '重要性评估',
  closure: '闭环检测',
  forgetting: '遗忘检测',
  parsing: '解析策略',
  direction: '方向倾向',
}

