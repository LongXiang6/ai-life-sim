/**
 * Purpose: Expose the world-initialization lifecycle through a focused MOD boundary.
 * Owner: mod-world
 * Responsibility: World initialization commands and parsers only; runtime context queries stay in their owning API.
 *
 * @module world-init-api.ts
 * @description 世界初始化重 API —— 与 index.ts 轻量导出分离，避免 barrel 加载环
 * @mod mod-world
 *
 * 跨 MOD 导入世界初始化调度时使用本入口（manifest secondaryPublicEntries）。
 */

export {
  commitWorldInitialization,
} from './world-init-bundle'

export type {
  AdditionalWorldContextOptions,
  WorldCommitResult,
  WorldContextCreationOptions,
} from './world-init-bundle'

export { WorldInitSystem } from './subsystems/world-init-system'
export { resolvePresetWorldCode } from './utils/preset-world-code'
