'use client'

/**
 * @module useEnvironmentEcologyHooks
 * @description mod-environment-ecology 自定义 Hook
 * @mod mod-environment-ecology
 */

import { useEnvironmentEcologyStore } from './store'

export function useClimate() {
  return useEnvironmentEcologyStore((s) => s.climate)
}

export function useGeography() {
  return useEnvironmentEcologyStore((s) => s.geography)
}

export function useEcology() {
  return useEnvironmentEcologyStore((s) => s.ecology)
}

export function useNaturalResource() {
  return useEnvironmentEcologyStore((s) => s.naturalResource)
}

export function usePollution() {
  return useEnvironmentEcologyStore((s) => s.pollution)
}

export function useEnvironmentEcology() {
  return useEnvironmentEcologyStore((s) => ({
    climate: s.climate,
    geography: s.geography,
    ecology: s.ecology,
    naturalResource: s.naturalResource,
    pollution: s.pollution,
  }))
}
