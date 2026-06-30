/**
 * @module world-init-api.ts
 * @description 世界初始化重 API —— 与 index.ts 轻量导出分离，避免 barrel 加载环
 * @mod mod-world
 *
 * 跨 MOD 导入世界初始化调度时使用本入口（manifest secondaryPublicEntries）。
 */

export {
  commitWorldInitialization,
  generateWorldInitBundle,
  startBackgroundWorldInit,
  startBackgroundWorldInitForCustom,
  startTimelineStageBackground,
} from './world-init-bundle'

export type { WorldCommitResult, WorldInitBundleResult } from './world-init-bundle'

export { WorldInitSystem } from './subsystems/world-init-system'
export { filterCoherentWorldTags } from './utils/world-coherence-output-guard'
export {
  buildWorldInitKvSessionId,
  configForWorldInitSubPool,
  parseWorldTagsResponse,
  prepareWorldInitUserPrompt,
} from './utils/world-init-kv'
export { resolvePresetWorldCode } from './utils/preset-world-code'
export {
  scanWorldCodesWithGeneratedCache,
  hasWorldGeneratedCache,
  clearWorldGeneratedCache,
} from './utils/world-generated-cache'

export { inferAnchorYearFromDescription } from './utils/world-init-anchor-year'
