/**
 * Purpose: Declare the engine MOD identity and registration metadata.
 * Owner: mod-engine
 * Responsibility: Static MOD manifest only; runtime behavior remains in registered engine systems.
 */

import { defineMod } from '@/core'

export default defineMod({
  name: 'mod-engine',
  order: 100,
  version: '1.0.0',
  description: 'AI 人生模拟器核心引擎',
  dependencies: [],
  provides: ['engine', 'orchestrator', 'narrative-parser'],
  consumes: [],
  featureFlags: {
    aiNarrative: true,
    eventBus: true,
    persistStore: true,
  },
  subsystems: ['OrchestratorSystem', 'TimeSystem', 'NarrativeParserSystem', 'SummaryCompressorSystem', 'SubsystemRelevanceSystem', 'MemoryLifecycleSystem', 'CausalDelaySystem', 'PlotStructureSystem', 'ForeshadowingSystem'],
  secondaryPublicEntries: ['engine-api.ts'],
  serverOnlyPublicEntries: ['server-prompt-assets.ts'],
  stores: ['useEngineStore'],
  events: {
    emits: ['mod-engine:round-start', 'mod-engine:round-complete', 'mod-engine:narrative-compressed', 'mod-character:died'],
    listens: ['core:all-mods-loaded'],
  },
  campaignHooks: {
    stages: [
      'prepare-round',
      'queue-round',
      'advance-time',
      'subsystem-advance',
      'collect-states',
      'event-lifecycle',
      'assemble-prompt',
      'ai-narration',
      'prepare-narrative',
      'ai-story-continuity',
      'ai-talent-growth',
      'commit-round',
      'finalize-round',
    ],
  },
})
