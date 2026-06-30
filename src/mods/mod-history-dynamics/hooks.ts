'use client'

/**
 * @module useHistoryDynamicsHooks
 * @description mod-history-dynamics 自定义 Hook
 * @mod mod-history-dynamics
 */

import { useHistoryDynamicsStore } from './store'

export function useEventPool() {
  return useHistoryDynamicsStore((s) => s.eventPool)
}

export function useCausalSimulation() {
  return useHistoryDynamicsStore((s) => s.causalSimulation)
}

export function useHistoryDynamics() {
  return useHistoryDynamicsStore((s) => ({
    eventPool: s.eventPool,
    causalSimulation: s.causalSimulation,
    getSummary: s.getSummary,
    setEventPool: s.setEventPool,
    setCausalSimulation: s.setCausalSimulation,
    reset: s.reset,
  }))
}
