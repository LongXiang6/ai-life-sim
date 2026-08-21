/**
 * Purpose: Assemble fixed-calendar festival and social-rhythm guidance for the main narrative.
 * Owner: mod-engine / time-system
 * Responsibility: Prompt projection only; time state and story selection remain with their owners.
 */

import type { TimeStep } from '@/foundation'
import {
  buildFestivalNarrativeHint,
  type FestivalScope,
} from '../subsystems/time-system/festival-calendar'
import { buildCanonicalCalendarNarrativeHint } from './time-scale-narrative'

export interface CalendarNarrativeContextInput {
  timeStep: TimeStep
  calendarYear: number
  seasonName?: string
  month: number
  day: number
  festivalScope: FestivalScope
  characterStageName?: string
  characterBackground?: string
  previousNode?: {
    calendarYear: number
    month: number
    day: number
  }
  daysPassed?: number
  timeStepAlignment?: {
    fromUnit: TimeStep['unit']
    fromValue: number
  }
}

export function buildCalendarNarrativeContext(input: CalendarNarrativeContextInput): string {
  const canonicalSpanRule = buildCanonicalCalendarNarrativeHint(input)
  const hasActualWindow = input.previousNode !== undefined
    && typeof input.daysPassed === 'number'
    && input.daysPassed > 0
  let granularityRule: string
  switch (input.timeStep.unit) {
    case 'day':
      granularityRule = '上学、上班与营业状态由同条世界设定、地区节日、寒暑假/学期、休息日和社会作息共同决定；现有事实支持到哪一层，正文就写到哪一层。'
      break
    case 'month':
      granularityRule = hasActualWindow
        ? '依据上述实际时间窗口中的节日、假期、学期与行业周期，选择最能代表这段阶段变化的事件。'
        : '结合覆盖月份内的节日、假期、学期与行业周期，选择最能代表阶段变化的事件。'
      break
    case 'season':
      granularityRule = hasActualWindow
        ? '让上述实际时间窗口对应的节庆、学期阶段、农事或生产节律进入代表性场景，跨季度时同步呈现节律变化。'
        : '让覆盖季度在当前世界与地区对应的节庆、学期阶段、农事或生产节律进入代表性场景，跨季度时同步呈现节律变化。'
      break
    case 'year':
    default:
      granularityRule = hasActualWindow
        ? '节日与校历作为上述实际窗口的节奏线索，用能够承载整段跨度的关系、事业、环境或制度变化组织场景。'
        : '节日与校历作为年度或多年节奏的一部分，用持续变化的关系、事业、环境或制度组织整段故事。'
      break
  }

  const configuredFestival = buildFestivalNarrativeHint({
    scope: input.festivalScope,
    timeStep: input.timeStep,
    month: input.month,
    day: input.day,
    seasonName: input.seasonName,
    characterStageName: input.characterStageName,
    characterBackground: input.characterBackground,
  })
  const worldviewRule = '统一游戏历法只负责确定日期与季节；节日是否形成放假、上学、工作、营业或地方习俗，须结合当前区域、世界语境、角色生命阶段与身份判断。'

  return ['【历法与社会作息】', canonicalSpanRule, worldviewRule, granularityRule, configuredFestival]
    .filter(Boolean)
    .join('\n')
}
