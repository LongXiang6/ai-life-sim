/**
 * Purpose: Normalize local character and fate-preview values.
 * Owner: mod-pages/fate-preview
 * Responsibility: Pure preview rules only.
 */

import { randomName, RACE_LIFESPAN } from '@/mods/mod-character'
import type { BaseAttributes, LifespanDraftState, RaceLifespanConfig } from '@/mods/mod-character'

export const GENDER_LABELS: Record<string, string> = { male: '男', female: '女' }

export const ATTRIBUTE_ICONS: Record<keyof BaseAttributes, string> = {
  physique: '💪',
  mind: '🧠',
  talentAptitude: '✨',
  charisma: '💫',
}

export function resolveDisplayName(rawName: string, gender: string): string {
  const trimmed = rawName.trim()
  if (trimmed && trimmed !== 'AI命名') return trimmed
  return randomName(gender === 'male' ? '男' : gender === 'female' ? '女' : undefined)
}

export function resolvePreviewRaceInfo(race: string, lifespan: LifespanDraftState): RaceLifespanConfig {
  const catalogRace = RACE_LIFESPAN[race]
  if (catalogRace) return catalogRace
  if (lifespan.race?.name === race) return lifespan.race
  const fallbackRace = lifespan.race ?? RACE_LIFESPAN.human!
  return {
    ...fallbackRace,
    name: race.trim() || fallbackRace.name || '未知',
    baseLifespanYears: lifespan.maximumLifespanYears > 0
      ? lifespan.maximumLifespanYears
      : fallbackRace.baseLifespanYears,
  }
}

export function hasConfirmedCharacter(
  name: string,
  race: string,
  startingAge: number,
  lifespan: LifespanDraftState,
): boolean {
  const expectedRaceName = RACE_LIFESPAN[race]?.name ?? race.trim()
  return Boolean(
    name.trim()
    && expectedRaceName
    && lifespan.race?.name === expectedRaceName
    && Number.isFinite(lifespan.maximumLifespanYears)
    && lifespan.maximumLifespanYears > 0
    && Number.isFinite(lifespan.race.baseLifespanYears)
    && lifespan.race.baseLifespanYears > 0
    && Number.isFinite(startingAge)
    && startingAge >= 0
    && startingAge < lifespan.maximumLifespanYears
  )
}
