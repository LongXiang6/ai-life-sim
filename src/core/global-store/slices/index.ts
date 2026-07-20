/**
 * @module slices/index.ts
 * @description MOD Store 分片入口 —— 各 MOD 的 Zustand Store 在此注册
 * @mod core
 *
 * 仅 import 各 MOD 的 store.ts，避免拉整包 index.ts（orchestrator / 子系统链）。
 */

export { useEngineStore } from '@/mods/mod-engine/store'
export { useCharacterStore } from '@/mods/mod-character/store'
export { useCultureStore } from '@/mods/mod-culture/store'
export { useDifficultyStore } from '@/mods/mod-difficulty/store'
export { useEconomyStore } from '@/mods/mod-economy/store'
export { useEnvironmentEcologyStore } from '@/mods/mod-environment-ecology/store'
export { useHistoryDynamicsStore } from '@/mods/mod-history-dynamics/store'
export { useNPCStore } from '@/mods/mod-npc/store'
export { usePoliticsStore } from '@/mods/mod-politics/store'
export { usePowerSystemStore } from '@/mods/mod-power-system/store'
export { useSettingsStore } from '@/mods/mod-settings/store'
export { useTechLevelStore } from '@/mods/mod-tech-level/store'
export { useToastStore } from '@/mods/mod-ui/store'
export { useBaseUniverseStore } from '@/mods/mod-base-universe/store'
export { useWorldMapStore } from '@/mods/mod-world-map/store'
export { useWorldStore } from '@/mods/mod-world/store'
