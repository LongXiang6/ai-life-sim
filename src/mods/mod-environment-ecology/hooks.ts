'use client'

import { useEnvironmentEcologyStore } from './store'

export function useClimate() {
  return useEnvironmentEcologyStore((state) => state.climate)
}

export function useEcology() {
  return useEnvironmentEcologyStore((state) => state.ecology)
}

export function usePollution() {
  return useEnvironmentEcologyStore((state) => state.pollution)
}

export function useEnvironmentEcology() {
  return useEnvironmentEcologyStore((state) => ({
    climate: state.climate,
    ecology: state.ecology,
    pollution: state.pollution,
  }))
}
