/**
 * Purpose: Define the fixed game-calendar festivals available to narrative guidance.
 * Owner: mod-engine / time-system
 * Responsibility: Festival dates and deterministic prompt projection only; story selection remains with the narrative AI.
 */

import type { TimeStep } from '@/foundation'

export type FestivalScope = 'china' | 'china-and-international'

export interface GameCalendarFestival {
  id: string
  name: string
  month: number
  day: number
  scope: 'china' | 'international'
  activities: string
}

const CHINA_FESTIVALS: readonly GameCalendarFestival[] = [
  { id: 'china-new-year', name: '春节', month: 1, day: 1, scope: 'china', activities: '辞旧迎新、团聚、拜年与节庆休息' },
  { id: 'new-years-day', name: '元旦', month: 1, day: 1, scope: 'china', activities: '新年休息、新年计划与公共庆祝' },
  { id: 'lantern-festival', name: '元宵节', month: 1, day: 15, scope: 'china', activities: '灯会、团聚与夜间庆典' },
  { id: 'qingming-festival', name: '清明节', month: 4, day: 5, scope: 'china', activities: '追思、祭扫与春日出行' },
  { id: 'labor-day', name: '劳动节', month: 5, day: 1, scope: 'china', activities: '公共休息、出行与劳动者相关活动' },
  { id: 'dragon-boat-festival', name: '端午节', month: 5, day: 5, scope: 'china', activities: '节令食物、竞渡与辟疫习俗' },
  { id: 'qixi-festival', name: '七夕', month: 7, day: 7, scope: 'china', activities: '感情、乞巧与夜间相会' },
  { id: 'mid-autumn-festival', name: '中秋节', month: 8, day: 15, scope: 'china', activities: '团聚、赏月与节令食物' },
  { id: 'national-day', name: '国庆节', month: 10, day: 1, scope: 'china', activities: '公共庆典、休息与出行' },
  { id: 'double-ninth-festival', name: '重阳节', month: 9, day: 9, scope: 'china', activities: '登高、敬老与秋日活动' },
  { id: 'laba-festival', name: '腊八节', month: 12, day: 8, scope: 'china', activities: '岁末准备、节令食物与家庭活动' },
  { id: 'little-new-year', name: '小年', month: 12, day: 23, scope: 'china', activities: '扫尘、置办年货与迎新准备' },
  { id: 'new-years-eve', name: '除夕', month: 12, day: 30, scope: 'china', activities: '家庭团聚、年夜活动与守岁' },
]

const INTERNATIONAL_FESTIVALS: readonly GameCalendarFestival[] = [
  { id: 'valentines-day', name: '情人节', month: 2, day: 14, scope: 'international', activities: '感情表达、礼物与约会' },
  { id: 'halloween', name: '万圣夜', month: 10, day: 31, scope: 'international', activities: '装扮、夜间活动与节庆游戏' },
  { id: 'christmas', name: '圣诞节', month: 12, day: 25, scope: 'international', activities: '家庭聚会、礼物与公共节庆' },
]

function festivalsForScope(scope: FestivalScope): readonly GameCalendarFestival[] {
  return scope === 'china-and-international'
    ? [...CHINA_FESTIVALS, ...INTERNATIONAL_FESTIVALS]
    : CHINA_FESTIVALS
}

export function buildFestivalNarrativeHint(input: {
  scope: FestivalScope
  timeStep: TimeStep
  month: number
  day: number
  seasonName?: string
  characterStageName?: string
  characterBackground?: string
}): string | undefined {
  const festivals = festivalsForScope(input.scope)
  const matchingFestivals = festivals
    .filter((festival) => festival.month === input.month && festival.day === input.day)
    .map((festival) => festival.name)
  const dateFact = matchingFestivals.length > 0
    ? `当前日期对应已配置节日：${matchingFestivals.join('、')}。`
    : '当前日期没有已配置节日。'
  const scopeFact = input.scope === 'china-and-international'
    ? '节日数据范围：中国节日与国际节日。'
    : '节日数据范围：中国节日。'

  if (input.timeStep.unit === 'event') {
    return `【节日范围】本轮按事件节点推进；${scopeFact}${dateFact}`
  }
  return `【节日范围】本轮按统一游戏历法推进；${scopeFact}${dateFact}`
}
