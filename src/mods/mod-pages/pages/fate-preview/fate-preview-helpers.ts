/**
 * Purpose: Normalize character preview values and world-initialization progress.
 * Owner: mod-pages/fate-preview
 * Responsibility: Pure preview rules plus page-scoped seed persistence only.
 */

import { configStore } from '@/core'
import { randomName, RACE_LIFESPAN } from '@/mods/mod-character'
import type { BaseAttributes, LifespanDraftState, RaceLifespanConfig } from '@/mods/mod-character'
import { useWorldStore } from '@/mods/mod-world'
import type { WorldInitAIStatus } from '@/mods/mod-world'

export const GENDER_LABELS: Record<string, string> = { male: '男', female: '女' }

export const ATTRIBUTE_ICONS: Record<keyof BaseAttributes, string> = {
  physique: '💪',
  mind: '🧠',
  talentAptitude: '✨',
  charisma: '💫',
}

export const WORLD_INIT_STEPS = [
  { id: 'calibration', label: '维度推断与校准', shortLabel: '校准', icon: '01', description: 'AI 推断世界观维度与规则体系', doneFlag: (status: WorldInitAIStatus) => status.calibrationGenerated },
  { id: 'tags', label: '标签生成', shortLabel: '标签', icon: '02', description: '生成力量体系/文明阶段等标签', doneFlag: (status: WorldInitAIStatus) => status.tagsGenerated },
  { id: 'config', label: '规则配置', shortLabel: '参数', icon: '03', description: '整理世界规则与运行参数', doneFlag: (status: WorldInitAIStatus) => status.configGenerated },
  { id: 'entities', label: '实体生成', shortLabel: '实体', icon: '04', description: '生成地理/文化/组织实体', doneFlag: (status: WorldInitAIStatus) => status.entitiesGenerated },
] as const

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

export function loadFatePreviewSeed(): string | null {
  const worldCode = useWorldStore.getState().worldCode
  return configStore.get<{ storySeed: string }>('mod-pages', `fate-preview:${worldCode || 0}`)?.storySeed ?? null
}

export function persistFatePreviewSeed(storySeed: string): void {
  const worldCode = useWorldStore.getState().worldCode
  configStore.set('mod-pages', `fate-preview:${worldCode || 0}`, { storySeed })
}

export function getWorldInitState(status: WorldInitAIStatus | null, localWorldReady: boolean) {
  const completedSteps = status ? WORLD_INIT_STEPS.filter((step) => step.doneFlag(status)).length : 0
  return {
    complete: localWorldReady && status?.status === 'complete' && completedSteps === WORLD_INIT_STEPS.length,
    failed: status?.status === 'failed',
    progress: completedSteps,
    running: status?.status === 'running',
    stepLabel: status?.currentStep,
  }
}
