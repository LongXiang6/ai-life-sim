'use client'
import { useTechLevelStore } from './store'
export const useCultureTech = () => useTechLevelStore((state) => state.cultureTech)
