/**
 * @module engine-api.ts
 * @description 引擎重 API —— 与 index.ts 轻量导出分离，避免 barrel 加载环
 * @mod mod-engine
 *
 * orchestrator / 子系统单例等运行时入口。跨 MOD 或页面层使用时导入本文件
 * （manifest secondaryPublicEntries）。
 */

export { OrchestratorSystem, orchestrator } from './subsystems/orchestrator-system'
export { TimeSystem, timeSystem } from './subsystems/time-system'
export { NarrativeParserSystem, narrativeParser } from './subsystems/narrative-parser-system'
export { SummaryCompressorSystem, summaryCompressor } from './subsystems/summary-compressor-system'
export type { ParsedNarrative } from './subsystems/narrative-parser-system'
export type {
  CompressionLevel,
  CompressedEntry,
  CompressorConfig,
  CompressorStats,
  CompressionResult,
} from './subsystems/summary-compressor-system'

export { applyGameSave, collectGameSavePayload } from './helpers/save-restore'
export { clearPreGenQueue, getPreGenQueueLength } from './helpers/pre-gen-queue'
export { formatNarrativeTimeLabel } from './helpers/narrative-calendar'
export { buildOrchestratorWorldSetting } from './helpers/orchestrator-world-setting'

export type { NPCInteractionRecord } from './subsystems/core-memory-system'
