/**
 * @module time-scale-narrative.ts
 * @description 12 档时间步进到叙事视角提示的唯一组装权威
 * @mod mod-engine
 */

import type { TimeStep } from '@/foundation'
import { getSeasonForMonth, SOLAR_SEASON_NAMES as SEASON_NAMES } from './calendar-season.js'

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const

export interface CanonicalCalendarNarrativeInput {
  timeStep: TimeStep
  calendarYear: number
  calendarName?: string
  daysPerYear?: number
  monthsPerYear?: number
  seasonName?: string
  usesCanonicalSolarSeasons?: boolean
  month: number
  day: number
  /** 上一条已完成叙事的时间节点（显示纪年，月份/日期从1开始）。 */
  previousNode?: {
    calendarYear: number
    month: number
    day: number
  }
  /** 上一节点到当前结束节点之间实际推进的天数。 */
  daysPassed?: number
  /** 粗粒度切到细粒度后的首轮边界对齐；这段跨度不应被正文重新流水账化。 */
  timeStepAlignment?: {
    fromUnit: TimeStep['unit']
    fromValue: number
  }
}

function normalizeAmount(value: number | undefined): number {
  return Number.isFinite(value) && Number(value) > 0 ? Math.floor(Number(value)) : 1
}

export interface TimeScaleNarrativeProfile {
  key: string
  id: string
  macroLevel: number
  prompt: string
  localCalendarPrompt?: string
}

/** 可用时间步长与叙事镜头一一对应，顺序必须由微观严格递增到宏观。 */
export const TIME_SCALE_NARRATIVE_PROFILES: readonly TimeScaleNarrativeProfile[] = [
  {
    key: 'day:1',
    id: 'single-day-scene',
    macroLevel: 10,
    prompt: '【单日现场视角】镜头贴近角色这一日的连续行动、对话、感官、即时阻力与直接后果；可以细写动作和情绪，但不得把数周或数月的成果压进一天。',
  },
  {
    key: 'month:1',
    id: 'monthly-change',
    macroLevel: 20,
    prompt: '【月度变化视角】用一至两个前后承接的代表性场景表现本月变化；场景保持相同的中近景叙事距离，过渡只交代必要时间和因果，不插入月度报告，也不要把单日琐事夸成整月命运转折。',
  },
  {
    key: 'season:1',
    id: 'seasonal-stage',
    macroLevel: 30,
    prompt: '【季度阶段视角】用少量因果相连的代表性场景覆盖完整三个月；各场景保持一致的中景距离，环境、关系或任务节律只通过场景中的可见变化呈现，不写季度报告，也不得把整个季度压成一天的一幕。',
    localCalendarPrompt: '【当地时节阶段视角】服从当地历法的实际时间窗口，用少量因果相连且镜头一致的代表性场景呈现本时节变化；不得套用现实三个月季度，不写时节报告，也不得压成一天的一幕。',
  },
  {
    key: 'year:1',
    id: 'annual-panorama',
    macroLevel: 40,
    prompt: '【年度连续场景视角】用二至三个前后相承的代表性场景覆盖一整年：场景分别承担起点、阶段变化和结束结果，并保持相同的人物叙事距离；场景之间只用必要的时间与因果过渡，不写年度报告，不插入宏观总结，也不得把全年压成一个即时现场。0岁开场仍以出生与家世为起点，并继续用后续场景表现这一年形成的照料关系与生存处境。',
  },
  {
    key: 'year:3',
    id: 'three-year-life-stage',
    macroLevel: 50,
    prompt: '【三年人生阶段视角】用三个左右前后承接的人物场景表现连续三年的起点、积累或变化与结束结果；镜头始终保持在角色及其直接关系上，过渡只说明必要的时间和因果，不逐年报账，也不能只写最后一年。',
  },
  {
    key: 'year:5',
    id: 'five-year-growth-arc',
    macroLevel: 60,
    prompt: '【五年成长阶段视角】用三至四个镜头一致、前后承接的人物场景覆盖完整五年，表现长期行动如何积累为成长、职业、家庭或社会位置变化；不写五年概述后再突然切入单日现场。',
  },
  {
    key: 'year:10',
    id: 'decade-transformation',
    macroLevel: 70,
    prompt: '【十年人生转型视角】用三至四个前后承接的人物阶段场景展示角色人生阶段、核心关系、资源地位或外部环境如何变化；各节点保持相同叙事距离，不逐年罗列，不使用十年报告式概述，也不得把篇幅集中在结束节点当天。',
  },
  {
    key: 'year:50',
    id: 'half-century-history',
    macroLevel: 80,
    prompt: '【半世纪历史视角】从半世纪开始自然抬升到家族、组织、地域或制度层面，用至少三个时代节点写清个人命运与长期结构如何互相影响。每个节点保持一致的历史叙事距离，大部分篇幅不得停留在结束节点当天或任何单一现场；角色寿命不足时，只能由已有因果建立的延续主体承接，并保留最终历史位置。',
  },
  {
    key: 'year:100',
    id: 'century-epic',
    macroLevel: 90,
    prompt: '【世纪史诗视角】从世纪尺度描写政权、技术、文化、族群或世界秩序的重大转型，并以角色、家族、组织或遗产的延续串联至少三个时代节点；重点是百年前后世界与命运结构的根本差异，不得把世纪变化写成终点人物的一次回忆或单一现场。',
  },
  {
    key: 'year:200',
    id: 'multi-generational-structure',
    macroLevel: 100,
    prompt: '【跨世代结构视角】覆盖约两百年的多代更替，表现制度、文明关系、知识传统与资源版图如何重组。个人镜头只保留能代表代际承接、断裂或遗忘的节点，结尾必须说明最初选择留下了什么长期结构。',
  },
  {
    key: 'year:500',
    id: 'civilization-rise-and-fall',
    macroLevel: 110,
    prompt: '【文明兴衰视角】以五百年观察文明、政体、信仰体系、族群或力量体系的兴起、鼎盛、裂变与余波；角色及其遗产是穿越时代的因果线索，叙事重点转向文明尺度的创造、代价、覆灭与重生。',
  },
  {
    key: 'year:1000',
    id: 'millennial-era-legacy',
    macroLevel: 120,
    prompt: '【千年时代与遗产视角】用千年尺度展现纪元更替、文明迁徙、世界秩序和集体记忆的深层变化。只选择少数具有时代代表性的断点，追踪角色、后继者、组织、理念或遗产如何被继承、误读、神话化或彻底消散，并落到千年后的世界格局。',
  },
] as const

const TIME_SCALE_NARRATIVE_PROFILE_BY_KEY = new Map(
  TIME_SCALE_NARRATIVE_PROFILES.map((profile) => [profile.key, profile]),
)

export function getTimeScaleNarrativeProfile(timeStep: TimeStep): TimeScaleNarrativeProfile {
  const key = `${timeStep.unit}:${normalizeAmount(timeStep.value)}`
  const profile = TIME_SCALE_NARRATIVE_PROFILE_BY_KEY.get(key)
  if (!profile) throw new Error(`未声明的时间叙事视角: ${key}`)
  return profile
}

function formatYearMonth(absoluteMonth: number): string {
  const year = Math.floor(absoluteMonth / 12)
  const month = ((absoluteMonth % 12) + 12) % 12 + 1
  return `${year}年${month}月`
}

function subtractCalendarDays(year: number, month: number, day: number, days: number): {
  year: number
  month: number
  day: number
} {
  const result = { year, month, day }
  for (let remaining = days; remaining > 0; remaining--) {
    result.day--
    if (result.day > 0) continue
    result.month--
    if (result.month <= 0) {
      result.month = 12
      result.year--
    }
    result.day = DAYS_IN_MONTH[result.month - 1]
  }
  return result
}

function formatCalendarNode(node: {
  calendarYear: number
  month: number
  day: number
}): string {
  return `${node.calendarYear}年${node.month}月${node.day}日`
}

/**
 * 生成运行时真实的叙事窗口。
 *
 * 月/季/年推进的结束节点落在下一周期边界（例如 1月1日→2月1日），
 * 不能再按结束月份倒推成“2月发生了什么”。显式给出两端节点和实际天数，
 * 让模型只写上一节点之后到当前节点之间的事件。
 */
function buildActualNarrativeWindow(
  input: CanonicalCalendarNarrativeInput,
): string | undefined {
  const daysPassed = input.daysPassed
  if (!input.previousNode || typeof daysPassed !== 'number' || !Number.isFinite(daysPassed) || daysPassed <= 0) {
    return undefined
  }

  const previous = formatCalendarNode(input.previousNode)
  const current = formatCalendarNode(input)
  const usesLocalCalendar = input.usesCanonicalSolarSeasons === false
  const days = usesLocalCalendar
    ? Math.round(daysPassed * 100) / 100
    : Math.floor(daysPassed)
  const dayUnit = usesLocalCalendar ? '当地日' : '天'
  const unitLabel: Record<TimeStep['unit'], string> = {
    day: '日',
    month: '月',
    season: '季',
    year: '年',
  }
  const unit = unitLabel[input.timeStep.unit]
  const amount = normalizeAmount(input.timeStep.value)
  const alignment = input.timeStepAlignment
    ? `这是从${normalizeAmount(input.timeStepAlignment.fromValue)}${unitLabel[input.timeStepAlignment.fromUnit]}切换到当前${amount}${unit}后的边界对齐桥接；前一粗粒度窗口已经完成，不能把被跳过的跨度重新写成当前${unit}的流水账。正文直接从当前合法节点建立一个代表性现场、后果或新线索，必要时只用一句过渡。`
    : ''

  return `本轮实际时间窗口：上一叙事节点为${previous}，当前结束节点为${current}；已推进${days}${dayUnit}（${amount}${unit}）。正文只叙述上一节点之后至当前节点之间发生的事，不得重复上一节点之前已经完成的周期，也不得把当前结束节点之后的时间提前写入。${alignment}`
}

/** 构建可独立回归的历法跨度说明；季节只由月份推导。 */
export function buildCanonicalCalendarNarrativeHint(
  input: CanonicalCalendarNarrativeInput,
): string {
  const amount = normalizeAmount(input.timeStep.value)
  const actualWindow = buildActualNarrativeWindow(input)
  const usesCanonicalSolarSeasons = input.usesCanonicalSolarSeasons !== false
  if (!usesCanonicalSolarSeasons) {
    const calendarName = input.calendarName?.trim() || '当地历法'
    const daysPerYear = input.daysPerYear && input.daysPerYear > 0
      ? `每年${Math.floor(input.daysPerYear)}日`
      : '年长由当地规则定义'
    const monthsPerYear = input.monthsPerYear && input.monthsPerYear > 0
      ? `每年${Math.floor(input.monthsPerYear)}月`
      : '月份数量由当地规则定义'
    const seasonName = input.seasonName?.trim() || '当前当地时节'
    const calendarRule = `当前使用${calendarName}（${daysPerYear}、${monthsPerYear}）；当前为${input.calendarYear}年${input.month}月、${seasonName}。天气、衣着、生产和社会节律必须服从当地历法与世界设定，不得套用现实阳历的固定月份与四季关系。`
    const fallbackWindow = actualWindow
      ?? `本轮结束节点为${formatCalendarNode(input)}，按${amount}${input.timeStep.unit === 'day' ? '日' : input.timeStep.unit === 'month' ? '月' : input.timeStep.unit === 'season' ? '时节' : '年'}粒度推进。`
    return `${calendarRule}${fallbackWindow}`
  }

  const endSeason = SEASON_NAMES[getSeasonForMonth(input.month - 1)] ?? '未知'
  const calendarRule = `项目历法固定为3—5月春季、6—8月夏季、9—11月秋季、12—2月冬季；天气、衣着、农事与正文季节必须服从阳历月份，不得自行套用其他季节划分。其中${input.month}月必须称${endSeason}季；气温可以异常寒冷或炎热，但不得把该月改称其他季节。`

  if (actualWindow) {
    return `${calendarRule}${actualWindow}`
  }

  switch (input.timeStep.unit) {
    case 'day': {
      const start = subtractCalendarDays(
        input.calendarYear,
        input.month,
        input.day,
        amount - 1,
      )
      const span = amount === 1
        ? `${input.calendarYear}年${input.month}月${input.day}日`
        : `${start.year}年${start.month}月${start.day}日至${input.calendarYear}年${input.month}月${input.day}日，共${amount}天`
      return `${calendarRule}本轮覆盖${span}，结束节点属于${endSeason}季。`
    }
    case 'month': {
      const endMonth = input.calendarYear * 12 + input.month - 1
      const startMonth = endMonth - amount + 1
      const span = amount === 1
        ? formatYearMonth(endMonth)
        : `${formatYearMonth(startMonth)}至${formatYearMonth(endMonth)}，共${amount}个月`
      return `${calendarRule}本轮覆盖${span}，结束节点属于${endSeason}季；跨季时须让环境与社会节律随月份自然变化。`
    }
    case 'season': {
      const endMonth = input.calendarYear * 12 + input.month - 1
      const monthCount = amount * 3
      const startMonth = endMonth - monthCount + 1
      return `${calendarRule}本轮连续推进${amount}个季度（${monthCount}个月），覆盖${formatYearMonth(startMonth)}至${formatYearMonth(endMonth)}，结束节点属于${endSeason}季；不得把跨季跨度写成单一季节。`
    }
    case 'year':
    default: {
      const startYear = input.calendarYear - amount + 1
      const span = amount === 1
        ? `${input.calendarYear}年`
        : `${startYear}年至${input.calendarYear}年，共${amount}年`
      return `${calendarRule}本轮覆盖${span}。`
    }
  }
}

/** 根据当前时间步进生成叙事视角指示（注入 Prompt） */
export function buildTimeScaleNarrativeHint(
  timeStep: TimeStep,
  calendar?: { usesCanonicalSolarSeasons?: boolean; calendarName?: string },
): string {
  const amount = normalizeAmount(timeStep.value)
  const profile = getTimeScaleNarrativeProfile(timeStep)
  const unitLabel: Record<TimeStep['unit'], string> = {
    day: '日',
    month: '月',
    season: calendar?.usesCanonicalSolarSeasons === false ? '当地时节' : '季',
    year: '年',
  }
  const profilePrompt = timeStep.unit === 'season'
    && calendar?.usesCanonicalSolarSeasons === false
    && profile.localCalendarPrompt
    ? `${profile.localCalendarPrompt}当前采用${calendar.calendarName?.trim() || '当地历法'}。`
    : profile.prompt

  return [
    `【时间尺度】当前时间是本轮叙事的结束节点；正文只写上一叙事节点之后到当前节点之间发生的事。本次推进${amount}${unitLabel[timeStep.unit]}。`,
    profilePrompt,
    '正文必须沿同一时间跨度内的因果主线推进，不拼接互不相干的事件或生活切片。首句不要使用“这一年”“这一月”“这一天”等泛指时间套语，也不要复用上一轮起句结构；根据本档视角直接进入行动、关系变化、制度变化、冲突或时代格局，确需时间锚时使用“当前时间”中的具体纪年、季节、月日。',
  ].join('')
}
