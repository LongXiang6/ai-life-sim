'use client'

import { useCultureStore } from './store'

export const useEducation = () => useCultureStore((state) => state.education)
export const useCulture = () => useCultureStore((state) => state.culture)
export const useArt = () => useCultureStore((state) => state.art)
export const useWorks = () => useCultureStore((state) => state.works)
