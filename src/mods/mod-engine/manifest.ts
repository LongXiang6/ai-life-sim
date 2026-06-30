/**
 * @module manifest.ts
 * @description MOD 身份声明 —— AI 人生模拟器引擎
 * @mod mod-engine
 */

import { defineMod } from '@/core'

export default defineMod({
  name: 'mod-engine',
  version: '1.0.0',
  description: 'AI 人生模拟器核心引擎',
  dependencies: [],
  provides: ['engine', 'orchestrator', 'narrative-parser'],
  consumes: [],
  featureFlags: {
    aiNarrative: true,
    aiStreaming: true,
    eventBus: true,
    persistStore: true,
  },
  subsystems: ['OrchestratorSystem', 'TimeSystem', 'NarrativeParserSystem', 'SummaryCompressorSystem', 'MemoryEngineSystem', 'SubsystemRelevanceSystem', 'MemoryLifecycleSystem', 'MemoryForgettingSystem', 'CausalDelaySystem', 'PlotStructureSystem', 'ForeshadowingSystem', 'CoreMemorySystem'],
  secondaryPublicEntries: ['engine-api.ts'],
  stores: ['useEngineStore'],
  events: {
    emits: ['mod-engine:round-start', 'mod-engine:round-complete', 'mod-engine:post-narrative-notification', 'mod-engine:narrative-stream', 'mod-engine:narrative-compressed', 'mod-character:died'],
    listens: ['core:all-mods-loaded'],
  },
  campaignHooks: {
    stages: [
      'advance-time',
      'subsystem-advance',
      'collect-states',
      'event-lifecycle',
      'cross-domain',
      'assemble-prompt',
      'ai-narration',
      'post-processing',
      'epilogue-check',
      'compress-save',
    ],
  },
})
