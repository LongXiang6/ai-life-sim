/**
 * @module auto-generated
 * @description 自动生成文件，由 scripts/codegen/generate-mod-wiring.mjs 维护 — 请勿手动编辑
 * @mod codegen
 * Regenerate: npm run generate:wiring
 */

import type { ModManifest } from '@/foundation'

import modEngineManifest from './mod-engine/manifest'
import modCharacterManifest from './mod-character/manifest'
import modDifficultyManifest from './mod-difficulty/manifest'
import modHistoryDynamicsManifest from './mod-history-dynamics/manifest'
import modPagesManifest from './mod-pages/manifest'
import modPowerSystemManifest from './mod-power-system/manifest'
import modProgressionManifest from './mod-progression/manifest'
import modSettingsManifest from './mod-settings/manifest'
import modTechLevelManifest from './mod-tech-level/manifest'
import modUiManifest from './mod-ui/manifest'
import modWorldManifest from './mod-world/manifest'
import modWorldMapManifest from './mod-world-map/manifest'

/** 全部已注册 MOD 的 manifest（加载顺序由依赖图解析，此数组顺序仅用于注册） */
export const MOD_REGISTRY: ModManifest[] = [
  modEngineManifest,
  modCharacterManifest,
  modDifficultyManifest,
  modHistoryDynamicsManifest,
  modPagesManifest,
  modPowerSystemManifest,
  modProgressionManifest,
  modSettingsManifest,
  modTechLevelManifest,
  modUiManifest,
  modWorldManifest,
  modWorldMapManifest,
]
