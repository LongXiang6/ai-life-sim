/**
 * @module world-init-deps.ts
 * @description world-init-system 本地依赖聚合
 * @mod mod-world
 */

export type { WorldConfig, WorldSnapshot, RegionData, WorldTagsV2, MapTemplateConfig } from '../types'
export { MAP_TEMPLATES } from '../constants'
export { WORLDVIEW_TAG_DEFAULTS, combineTagDefaults } from '../constants/world-tag-defaults'
export { clampModifier, inferMapTemplate } from '../utils/calibration-clamp'
