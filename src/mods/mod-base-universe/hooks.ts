'use client'

/**
 * @module useBaseUniverse
 * @description mod-base-universe 自定义 Hook —— UI 层消费天象/纪元/世界地图/命运预言状态
 * @mod mod-base-universe
 */

import { useBaseUniverseStore } from './store'

export function useBaseUniverse() {
  return useBaseUniverseStore((s) => ({
    celestial: s.celestial,
    era: s.era,
    worldMap: s.worldMap,
    fateProphecy: s.fateProphecy,
    divineCreation: s.divineCreation,
  }))
}
