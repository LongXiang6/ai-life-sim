/**
 * @module life-stage-narrative.ts
 * @description 生命阶段叙事提示 —— 对齐废弃项目 buildLifeStageContext
 * @mod mod-engine
 */

import type { LifeStageId } from '@/mods/mod-character'

export function resolveLifeStageFromAge(
  age: number,
  maxAge: number,
  startingAge: number,
): LifeStageId {
  if (startingAge >= 18) {
    if (age < startingAge + 3) return 'young_adult'
    if (age < Math.round(maxAge * 0.2)) return 'young_adult'
    if (age < Math.round(maxAge * 0.5)) return 'adult'
    if (age < Math.round(maxAge * 0.75)) return 'middle_age'
    return 'elder'
  }
  if (age < 3) return 'infant'
  if (age < 12) return 'child'
  if (age < 18) return 'teenager'
  if (age < Math.round(maxAge * 0.2)) return 'young_adult'
  if (age < Math.round(maxAge * 0.5)) return 'adult'
  if (age < Math.round(maxAge * 0.75)) return 'middle_age'
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
  const youngAdultEnd = Math.round(maxAge * 0.2)
  const adultEnd = Math.round(maxAge * 0.5)
  const middleAgeEnd = Math.round(maxAge * 0.75)

  const stages: Record<LifeStageId, string> = {
    infant: isTransmigrator
      ? '穿越觉醒期：角色携带前世记忆苏醒，以成人心智适应新身体/新世界'
      : '幼儿期（0-3岁）：仅通过感官认知世界，行动能力有限，叙事须符合该年龄段',
    child: isTransmigrator
      ? '适应期：角色迅速理解新世界的规则和环境'
      : '儿童期（3-12岁）：启蒙与家庭关系为主，叙事须符合该年龄段',
    teenager: isTransmigrator
      ? `探索期（${startingAge}-${youngAdultEnd}岁）：利用前世经验迅速成长`
      : '少年期（12-18岁）：自我意识觉醒，叙事须符合该年龄段',
    young_adult: `青年期（${Math.max(18, startingAge)}-${youngAdultEnd}岁）：独立与人生选择密集期`,
    adult: `成年期（${youngAdultEnd + 1}-${adultEnd}岁）：事业与家庭关键期`,
    middle_age: `中年期（${adultEnd + 1}-${middleAgeEnd}岁）：传承与人生意义`,
    elder: `老年期（${middleAgeEnd + 1}-${maxAge}岁）：暮年与回顾`,
    deceased: '已故',
  }

  const stageText = stages[stage] ?? stages.infant
  return [
    '【生命阶段叙事约束】',
    `当前 ${currentAge} 岁 · ${stageText}`,
    '叙事场景、行为能力与对话复杂度须严格匹配当前年龄，禁止写成其他年龄段。',
  ].join('\n')
}
