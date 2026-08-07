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

function seasonMonths(month: number): number[] {
  if (month >= 3 && month <= 5) return [3, 4, 5]
  if (month >= 6 && month <= 8) return [6, 7, 8]
  if (month >= 9 && month <= 11) return [9, 10, 11]
  return [12, 1, 2]
}

function festivalLabel(festival: GameCalendarFestival): string {
  return `${festival.month}月${festival.day}日${festival.name}`
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
  const stageName = input.characterStageName?.trim()
  const hasBackground = Boolean(input.characterBackground?.trim())
  const identity = [
    stageName ? `生命阶段“${stageName}”` : '',
    hasBackground ? '既有身份与背景' : '',
  ].filter(Boolean).join('和')
  const identityRule = identity
    ? `结合角色当前的${identity}，判断是否放假、休息、工作、上学或参与节庆。`
    : '结合角色的生命阶段与身份，判断是否放假、休息、工作、上学或参与节庆。'

  const exact = festivals.filter((festival) => festival.month === input.month && festival.day === input.day)
  if (input.timeStep.unit === 'day' && exact.length > 0) {
    return `【当前节日】今天是统一游戏历法${input.month}月${input.day}日：${exact.map((festival) => festival.name).join('、')}。正文必须体现至少一个对应的生活场景或社会节律（${exact.map((festival) => festival.activities).join('；')}）。${identityRule}`
  }

  let candidates: readonly GameCalendarFestival[]
  let rangeLabel: string
  switch (input.timeStep.unit) {
    case 'day':
      return undefined
    case 'month':
      candidates = festivals.filter((festival) => festival.month === input.month)
      rangeLabel = `本月`
      break
    case 'season': {
      const months = new Set(seasonMonths(input.month))
      candidates = festivals.filter((festival) => months.has(festival.month))
      rangeLabel = `当前${input.seasonName?.trim() || '季节'}`
      break
    }
    case 'year':
    default:
      return `【节日范围】本轮按统一游戏历法推进，中国节日默认可用${input.scope === 'china-and-international' ? '，并可选用国际节日' : ''}；只在对应时间节点选择有助于本轮因果主线的节日情节。${identityRule}`
  }

  if (candidates.length === 0) return undefined
  return `【节日候选】${rangeLabel}包含：${candidates.map(festivalLabel).join('、')}。它们是可选的剧情节点，不必全部出现；选用时必须与当前地区、世界语境和因果主线一致。${identityRule}`
}
