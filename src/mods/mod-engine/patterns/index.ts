/**
 * @module index.ts
 * @description 统一模式管理层 - 导出入口
 * @mod mod-engine
 */

// 类型定义
export type {
  PatternCategory,
  PatternMatchResult,
  PatternMatchResultWithMeta,
  IPattern,
  IPatternRegistry,
  IPatternFactory,
  PatternTestCase,
  PatternTestResult,
} from './pattern-types'
export { CATEGORY_LABELS } from './pattern-types'

// 基础抽象类
export { BasePattern, KeywordPattern, CompoundPattern } from './base-pattern'

// 注册表和工厂
export { PatternRegistry } from './pattern-registry'
export { PatternFactory } from './pattern-factory'

// 管理器
export { patternManager } from './pattern-manager'

// 关系模式
export type { RelationshipData } from './relationship-patterns'
export {
  SpousePattern,
  FatherPattern,
  MotherPattern,
  ChildPattern,
  FriendPattern,
  EnemyPattern,
  MasterPattern,
  DisciplePattern,
  SiblingPattern,
  RELATIONSHIP_PATTERNS,
} from './relationship-patterns'

// 重要性模式
export type { ImportanceResult } from './importance-patterns'
export {
  HighImportancePattern,
  NormalImportancePattern,
  LowImportancePattern,
  ImportanceEvaluator,
  IMPORTANCE_PATTERNS,
  importanceEvaluator,
} from './importance-patterns'

// 结束模式
export type { ClosureType, ClosureResult } from './closure-patterns'
export {
  BattleClosurePattern,
  JourneyClosurePattern,
  TaskClosurePattern,
  RelationshipClosurePattern,
  LifeStageClosurePattern,
  ClosureDetector,
  CLOSURE_PATTERNS,
  closureDetector,
} from './closure-patterns'

// 遗忘模式
export type { ForgettingAnalysis } from './forgetting-patterns'
export {
  ImportantEventPattern,
  RelationshipPattern,
  TrivialPattern,
  RepetitivePattern,
  ForgettingAnalyzer,
  FORGETTING_PATTERNS,
  forgettingAnalyzer,
} from './forgetting-patterns'

// 解析策略模式