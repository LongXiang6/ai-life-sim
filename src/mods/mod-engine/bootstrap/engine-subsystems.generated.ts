/**
 * @module auto-generated
 * @description 自动生成文件，由 scripts/codegen/generate-mod-wiring.mjs 维护 — 请勿手动编辑
 * @mod codegen
 * Regenerate: npm run generate:wiring
 */

import { TimeSystem, timeSystem } from '../subsystems/time-system'
import { NarrativeParserSystem, narrativeParser } from '../subsystems/narrative-parser-system'
import { SummaryCompressorSystem, summaryCompressor } from '../subsystems/summary-compressor-system'
import { MemoryEngineSystem, memoryEngine } from '../subsystems/memory-engine-system'
import { SubsystemRelevanceSystem, subsystemRelevance } from '../subsystems/subsystem-relevance-system'
import { MemoryLifecycleSystem, memoryLifecycle } from '../subsystems/memory-lifecycle-system'
import { MemoryForgettingSystem, memoryForgetting } from '../subsystems/memory-forgetting-system'
import { CausalDelaySystem, causalDelay } from '../subsystems/causal-delay-system'
import { PlotStructureSystem, plotStructure } from '../subsystems/plot-structure-system'
import { ForeshadowingSystem, foreshadowing } from '../subsystems/foreshadowing-system'
import { CoreMemorySystem, coreMemory } from '../subsystems/core-memory-system'

/** mod-engine manifest 声明的子系统类名 → 运行时单例（OrchestratorSystem 因循环依赖排除） */
export const ENGINE_SUBSYSTEM_MAP = {
  // OrchestratorSystem: 排除（registry 消费者，避免循环依赖）
  TimeSystem: timeSystem,
  NarrativeParserSystem: narrativeParser,
  SummaryCompressorSystem: summaryCompressor,
  MemoryEngineSystem: memoryEngine,
  SubsystemRelevanceSystem: subsystemRelevance,
  MemoryLifecycleSystem: memoryLifecycle,
  MemoryForgettingSystem: memoryForgetting,
  CausalDelaySystem: causalDelay,
  PlotStructureSystem: plotStructure,
  ForeshadowingSystem: foreshadowing,
  CoreMemorySystem: coreMemory,
} as const

export {
  CausalDelaySystem,
  CoreMemorySystem,
  ForeshadowingSystem,
  MemoryEngineSystem,
  MemoryForgettingSystem,
  MemoryLifecycleSystem,
  NarrativeParserSystem,
  PlotStructureSystem,
  SubsystemRelevanceSystem,
  SummaryCompressorSystem,
  TimeSystem,
  causalDelay,
  coreMemory,
  foreshadowing,
  memoryEngine,
  memoryForgetting,
  memoryLifecycle,
  narrativeParser,
  plotStructure,
  subsystemRelevance,
  summaryCompressor,
  timeSystem,
}
