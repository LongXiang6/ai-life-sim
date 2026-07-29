'use client'

/**
 * @module useCultureHooks
 * @description mod-culture 自定义 Hook
 * @mod mod-culture
 */

import { useCultureStore } from './store'

export function useReputation() {
  return useCultureStore((s) => s.reputation)
}

export function useFamily() {
  return useCultureStore((s) => s.family)
}

export function useEducation() {
  return useCultureStore((s) => s.education)
}

export function useCulture() {
  return useCultureStore((s) => s.culture)
}

export function useArt() {
  return useCultureStore((s) => s.art)
}

export function useDisciple() {
  return useCultureStore((s) => s.disciple)
}

export function usePersonalAbility() {
  return useCultureStore((s) => s.personalAbility)
}

export function useAchievements() {
  return useCultureStore((s) => s.achievement)
}

export function useWorks() {
  return useCultureStore((s) => s.works)
}
