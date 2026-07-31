'use client'
import { usePoliticsStore } from './store'
export const useSocialStratification = () => usePoliticsStore((state) => state.socialStratification)
export const useFaction = () => usePoliticsStore((state) => state.faction)
export const useLegal = () => usePoliticsStore((state) => state.legal)
export const useConflictCycle = () => usePoliticsStore((state) => state.conflictCycle)
