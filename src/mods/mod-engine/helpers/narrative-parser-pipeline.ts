/**
 * @module narrative-parser-pipeline.ts
 * @description narrative-parser 解析管线依赖聚合
 * @mod mod-engine
 */

export { ChineseTextProcessor } from './chinese-text-processor'
export { JsonParseStrategy, RegexExtractStrategy, PlainTextStrategy } from './parse-strategies'
export type { DegradationStats } from './degradation-manager'
export { DegradationManager } from './degradation-manager'
export { FallbackNarrativeBuilder } from './fallback-narrative-builder'
