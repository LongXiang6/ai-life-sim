/**
 * @module auto-generated
 * @description 自动生成文件，由 scripts/codegen/generate-mod-wiring.mjs 维护 — 请勿手动编辑
 * @mod codegen
 * Regenerate: npm run generate:wiring
 */

import type { ModManifest } from '@/foundation'

import modEngineManifest from './mod-engine/manifest'
import modBaseUniverseManifest from './mod-base-universe/manifest'
import modCharacterManifest from './mod-character/manifest'
import modCultureManifest from './mod-culture/manifest'
import modDifficultyManifest from './mod-difficulty/manifest'
import modEconomyManifest from './mod-economy/manifest'
import modEnvironmentEcologyManifest from './mod-environment-ecology/manifest'
import modHistoryDynamicsManifest from './mod-history-dynamics/manifest'
import modNPCManifest from './mod-npc/manifest'
import modPagesManifest from './mod-pages/manifest'
import modPoliticsManifest from './mod-politics/manifest'
import modPowerSystemManifest from './mod-power-system/manifest'
import modSettingsManifest from './mod-settings/manifest'
import modTechLevelManifest from './mod-tech-level/manifest'
import modUiManifest from './mod-ui/manifest'
import modWorldManifest from './mod-world/manifest'
import modWorldMapManifest from './mod-world-map/manifest'

/** 全部已注册 MOD 的 manifest（加载顺序由依赖图解析，此数组顺序仅用于注册） */
export const MOD_REGISTRY: ModManifest[] = [
  modEngineManifest,
  modBaseUniverseManifest,
  modCharacterManifest,
  modCultureManifest,
  modDifficultyManifest,
  modEconomyManifest,
  modEnvironmentEcologyManifest,
  modHistoryDynamicsManifest,
  modNPCManifest,
  modPagesManifest,
  modPoliticsManifest,
  modPowerSystemManifest,
  modSettingsManifest,
  modTechLevelManifest,
  modUiManifest,
  modWorldManifest,
  modWorldMapManifest,
]
