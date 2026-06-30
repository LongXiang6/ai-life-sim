/**
 * @module world-timeline-deps.ts
 * @description world-timeline-system 本地依赖聚合
 * @mod mod-world
 */

export {
  STAGE_SPAN,
  WINDOW_RADIUS,
  SEGMENTS_PER_STAGE,
  BATCH_SEGMENTS,
  IMPACT_LEVELS,
  IMPACT_LEVEL_CONFIGS,
} from './constants'
export type {
  TimelineEvent,
  StageMeta,
  WorldTimelineInternalState,
  ImpactLevel,
  WorldTimelineEventType,
  EventDistributionStrategy,
} from './types'
export { worldTimelinePrompt, pastHistoryPrompt } from './prompts'
export { parseAIJSON } from './utils/parse-ai-json'
export { getStageIndex } from './utils/stage-index'
export {
  STRATEGY_IMPACT_MULTIPLIERS,
  getEventDistributionStrategy,
  getImpactRangeModifier,
  getWorldviewStyleHint,
} from './utils/calibration-clamp'
export { buildTimelineStyleHint, resolveWorldviewStyleHint } from './utils/world-coherence-hints'
