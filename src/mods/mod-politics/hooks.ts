'use client'

/**
 * @module usePoliticsHooks
 * @description mod-politics 自定义 Hook
 * @mod mod-politics
 */

import { usePoliticsStore } from './store'

export function useSocialStratification() {
  return usePoliticsStore((s) => s.socialStratification)
}

export function useFaction() {
  return usePoliticsStore((s) => s.faction)
}

export function useNationRelation() {
  return usePoliticsStore((s) => s.nationRelation)
}

export function useLegal() {
  return usePoliticsStore((s) => s.legal)
}

export function useConflictCycle() {
  return usePoliticsStore((s) => s.conflictCycle)
}

export function useLanguageNaming() {
  return usePoliticsStore((s) => s.languageNaming)
}

export function useSocialValues() {
  return usePoliticsStore((s) => s.socialValues)
}
