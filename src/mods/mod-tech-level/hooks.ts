'use client'

/**
 * @module useTechLevelHooks
 * @description mod-tech-level 自定义 Hook
 * @mod mod-tech-level
 */

import { useTechLevelStore } from './store'

export function useIndustry() {
  return useTechLevelStore((s) => s.industry)
}

export function useResource() {
  return useTechLevelStore((s) => s.resourceDistribution)
}

export function useCultureTech() {
  return useTechLevelStore((s) => s.cultureTech)
}
