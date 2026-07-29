/**
 * @module life-stage-narrative.ts
 * @description 生命阶段叙事提示 —— 对齐废弃项目 buildLifeStageContext
 * @mod mod-engine
 */

import type { LifeStageId } from '@/mods/mod-character'

interface LifeStageBoundaries {
  youngAdultStart: number
  youngAdultExclusiveEnd: number
  adultExclusiveEnd: number
  middleAgeExclusiveEnd: number
}

function getLifeStageBoundaries(maxAge: number, startingAge: number): LifeStageBoundaries {
  const normalizedMaxAge = Math.max(0, Math.round(maxAge))
  const youngAdultStart = Math.max(18, Math.round(startingAge))
  const youngAdultExclusiveEnd = Math.max(
    youngAdultStart + 3,
    Math.round(normalizedMaxAge * 0.2),
  )
  const adultExclusiveEnd = Math.max(
    youngAdultExclusiveEnd + 1,
    Math.round(normalizedMaxAge * 0.5),
  )
  const middleAgeExclusiveEnd = Math.max(
    adultExclusiveEnd + 1,
    Math.round(normalizedMaxAge * 0.75),
  )

  return {
    youngAdultStart,
    youngAdultExclusiveEnd,
    adultExclusiveEnd,
    middleAgeExclusiveEnd,
  }
}

export function resolveLifeStageFromAge(
  age: number,
  maxAge: number,
  startingAge: number,
): LifeStageId {
  const boundaries = getLifeStageBoundaries(maxAge, startingAge)

  if (startingAge < 18) {
    if (age < 3) return 'infant'
    if (age < 12) return 'child'
    if (age < 18) return 'teenager'
  }
  if (age < boundaries.youngAdultExclusiveEnd) return 'young_adult'
  if (age < boundaries.adultExclusiveEnd) return 'adult'
  if (age < boundaries.middleAgeExclusiveEnd) return 'middle_age'
  return 'elder'
}

/** 注入叙事的年龄阶段约束（与废弃项目 life-sim-lifecycle 对齐） */
export function buildLifeStageNarrativeHint(
  stage: LifeStageId,
  maxAge: number,
  startingAge: number,
  currentAge: number,
): string {
  const isTransmigrator = startingAge >= 18
  const {
    youngAdultStart,
    youngAdultExclusiveEnd,
    adultExclusiveEnd,
    middleAgeExclusiveEnd,
  } = getLifeStageBoundaries(maxAge, startingAge)
  const youngAdultEnd = youngAdultExclusiveEnd - 1
  const adultStart = youngAdultExclusiveEnd
  const adultEnd = adultExclusiveEnd - 1
  const middleAgeStart = adultExclusiveEnd
  const middleAgeEnd = middleAgeExclusiveEnd - 1
  const elderStart = middleAgeExclusiveEnd

  const stages: Record<LifeStageId, string> = {
    infant: isTransmigrator
      ? '穿越觉醒期：角色携带前世记忆苏醒，以成人心智适应新身体/新世界'
      : '幼儿期（0-3岁）：镜头只呈现当下感官、简单动作、短句理解和直接回应，认知与身体能力须符合具体年龄',
    child: isTransmigrator
      ? '适应期：角色迅速理解新世界的规则和环境'
      : '儿童期（3-12岁）：启蒙与家庭关系为主，叙事须符合该年龄段',
    teenager: isTransmigrator
      ? `探索期（${startingAge}-${youngAdultEnd}岁）：利用前世经验迅速成长`
      : '少年期（12-18岁）：自我意识觉醒，叙事须符合该年龄段',
    young_adult: `青年期（${youngAdultStart}-${youngAdultEnd}岁）：独立与人生选择密集期`,
    adult: `成年期（${adultStart}-${adultEnd}岁）：事业与家庭关键期`,
    middle_age: `中年期（${middleAgeStart}-${middleAgeEnd}岁）：传承与人生意义`,
    elder: `老年期（${elderStart}-${maxAge}岁）：暮年与回顾`,
    deceased: '已故',
  }

  const stageText = stages[stage] ?? stages.infant
  return [
    '【生命阶段叙事约束】',
    `当前 ${currentAge} 岁 · ${stageText}`,
    '叙事场景、行为能力、认知与对话复杂度须严格匹配当前年龄。',
  ].join('\n')
}
