/**
 * Purpose: Calculate normalized character-creation values before preview or commit.
 * Owner: mod-pages/character-create
 * Responsibility: Pure lifespan, attribute, and primitive-world calculations only.
 */

import { RACE_LIFESPAN } from '@/mods/mod-character'
import type { BaseAttributes, RaceLifespanConfig } from '@/mods/mod-character'

export function computeMaxAge(race: string, manualOverride?: number): number {
  if (manualOverride && manualOverride > 0) {
    return Math.min(Math.round(manualOverride), Math.floor(Number.MAX_SAFE_INTEGER / 365))
  }
  return Math.max(1, Math.round(
    RACE_LIFESPAN[race]?.baseLifespanYears ?? RACE_LIFESPAN.human!.baseLifespanYears,
  ))
}

export function buildConfirmedRaceLifespan(race: string, maxAge: number): RaceLifespanConfig {
  const catalogRace = RACE_LIFESPAN[race]
  if (catalogRace) return { ...catalogRace }
  return {
    ...RACE_LIFESPAN.human!,
    name: race.trim() || '自定义种族',
    baseLifespanYears: maxAge,
  }
}

export function toBaseAttributes(attributes: Record<string, number>): BaseAttributes {
  return {
    physique: attributes.physique ?? 0,
    mind: attributes.mind ?? 0,
    talentAptitude: attributes.talentAptitude ?? 0,
    charisma: attributes.charisma ?? 0,
  }
}

export function isPrimitiveWorld(eraStartYear: number, worldTags: string[]): boolean {
  if (eraStartYear < -10000) return true
  const keywords = ['原始', '上古', '远古', '石器', '洪荒', '史前', 'primitive', 'prehistoric']
  return worldTags.some((tag) => keywords.some((keyword) => tag.includes(keyword)))
}

export function buildAgeSetupPreview(input: {
  computedLifespan: number | null
  manualLifespan: string
  manualStartingAge: string
  race: string
}): { maxAge: number; startingAge: number; error: string | null } {
  const parsedMaxAge = input.manualLifespan
    ? Number.parseInt(input.manualLifespan, 10)
    : undefined
  const maxAge = parsedMaxAge !== undefined && Number.isFinite(parsedMaxAge)
    ? computeMaxAge(input.race, parsedMaxAge)
    : input.computedLifespan ?? computeMaxAge(input.race)
  const parsedStartingAge = input.manualStartingAge
    ? Number.parseInt(input.manualStartingAge, 10)
    : 0
  const startingAge = Number.isFinite(parsedStartingAge) ? parsedStartingAge : 0
  return {
    maxAge,
    startingAge,
    error: startingAge >= maxAge ? `起始年龄必须小于预期寿命（${maxAge} 岁）` : null,
  }
}
