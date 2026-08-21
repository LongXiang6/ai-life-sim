/**
 * Purpose: Project canonical time spans into scale-aware narrative guidance.
 * Owner: mod-engine
 * Responsibility: Time-scale and calendar Prompt hints only.
 *
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
  seasonName?: string
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
}

/** 可用时间步长与叙事镜头一一对应，顺序必须由微观严格递增到宏观。 */
export const TIME_SCALE_NARRATIVE_PROFILES: readonly TimeScaleNarrativeProfile[] = [
  {
    key: 'day:1',
    id: 'single-day-scene',
    macroLevel: 10,
    prompt: '【单日现场视角】镜头贴近角色这一日的连续行动、对话、感官、即时阻力与直接后果；长期变化在今天呈现为开端、征兆或一次可见推进。',
  },
  {
    key: 'month:1',
    id: 'monthly-change',
    macroLevel: 20,
    prompt: '【月度变化视角】围绕本月持续作用的一件事，用一至两个前后承接的代表性场景表现过程与结果；场景保持相同的中近景距离，时间通过人物、关系、环境或工作进度的变化自然流过。',
  },
  {
    key: 'season:1',
    id: 'seasonal-stage',
    macroLevel: 30,
    prompt: '【季度阶段视角】选择贯穿三个月的目标、关系或变化，用少量因果相连的代表性场景写出它怎样积累、转折并形成当前结果；环境、关系与任务节律通过场景中的可见变化呈现。',
  },
  {
    key: 'year:1',
    id: 'annual-panorama',
    macroLevel: 40,
    prompt: '【年度故事弧线视角】先确定这一年持续作用的一条因果主线，再用二至三个彼此照应的代表性场景写出开端、变化与结果；时间通过同一人物、关系、物件或目标的改变自然显现。若最近两轮已经沿用同一主线，本年必须选择另一条自然成立的因果主线，旧主线只能作为承接背景，不能占据多数篇幅。0岁开场从出生与家世起笔，并沿照料关系与生存处境写出这一年如何展开。',
  },
  {
    key: 'year:3',
    id: 'three-year-life-stage',
    macroLevel: 50,
    prompt: '【三年人生阶段视角】围绕一段关系、目标或处境的持续变化，用几个前后承接的场景写出三年中的积累、转折与当前结果；家庭、组织、地域或制度的变化通过它们与角色生活的真实交汇进入故事。',
  },
  {
    key: 'year:5',
    id: 'five-year-growth-arc',
    macroLevel: 60,
    prompt: '【五年成长阶段视角】选择一条能够承载五年变化的成长、职业、家庭或社会位置主线，用少量镜头一致、前后承接的场景表现长期行动如何积累、付出代价并改变生活，也呈现行业、社区、势力或环境如何独立变化并形成回应。',
  },
  {
    key: 'year:10',
    id: 'decade-transformation',
    macroLevel: 70,
    prompt: '【十年人生转型视角】以一条持续十年的核心变化为贯穿线，让角色阶段、核心关系、资源地位或外部环境在少量代表性场景中彼此作用；开头留下的问题在结尾获得结果或新的意义。',
  },
  {
    key: 'year:50',
    id: 'half-century-history',
    macroLevel: 80,
    prompt: '【半世纪历史视角】把个人命运放进家族、组织、地域或制度的长期变化中，选择少量能够代表转折的时代场景，追踪同一个选择、事业、关系或遗产如何改变形态并反过来塑造人生。角色生命结束后，由已有因果建立的延续主体承接其回声与历史位置。',
  },
  {
    key: 'year:100',
    id: 'century-epic',
    macroLevel: 90,
    prompt: '【世纪史诗视角】选择一个贯穿百年的政权、技术、文化、族群或世界秩序变化，以角色、家族、组织或遗产的延续串联少量时代场景，让百年前后的世界差异从同一因果中显现。',
  },
  {
    key: 'year:200',
    id: 'multi-generational-structure',
    macroLevel: 100,
    prompt: '【跨世代结构视角】以一个最初选择或遗产为起点，追踪它在约两百年的多代更替中如何被承接、改变、遗忘或重新理解，并让制度、文明关系、知识传统与资源版图的重组围绕这条线展开。',
  },
  {
    key: 'year:500',
    id: 'civilization-rise-and-fall',
    macroLevel: 110,
    prompt: '【文明兴衰视角】以角色及其遗产作为穿越时代的因果线索，讲述文明、政体、信仰体系、族群或力量体系在五百年中如何从一处起点走向创造、代价、裂变与余波。',
  },
  {
    key: 'year:1000',
    id: 'millennial-era-legacy',
    macroLevel: 120,
    prompt: '【千年时代与遗产视角】选择一条能够穿越千年的遗产、理念、组织或集体记忆，借少数具有时代代表性的场景追踪它如何被继承、改写、神话化或消散，并让纪元更替、文明迁徙与世界秩序的变化围绕它形成完整回声。',
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
  const days = Math.floor(daysPassed)
  const unitLabel: Record<TimeStep['unit'], string> = {
    day: '日',
    month: '月',
    season: '季',
    year: '年',
  }
  const unit = unitLabel[input.timeStep.unit]
  const amount = normalizeAmount(input.timeStep.value)
  const alignment = input.timeStepAlignment
    ? `这是从${normalizeAmount(input.timeStepAlignment.fromValue)}${unitLabel[input.timeStepAlignment.fromUnit]}切换到当前${amount}${unit}后的边界对齐桥接；前一粗粒度窗口已经完成。正文从当前合法节点建立一个代表性现场、后果或新线索，用一句必要过渡连接已经成立的背景。`
    : ''

  return `本轮实际时间窗口：上一叙事节点为${previous}，当前结束节点为${current}；已推进${days}天（${amount}${unit}）。正文取材范围是两个节点之间已经发生的事情，以窗口内正在发生的行动、关系、环境或世界变化进入场景，开端承接上一节点的既成结果，收束落在当前结束节点；日期、年龄与阶段名称在需要定位转折时自然出现。${alignment}`
}

/** 构建可独立回归的历法跨度说明；季节只由月份推导。 */
export function buildCanonicalCalendarNarrativeHint(
  input: CanonicalCalendarNarrativeInput,
): string {
  const amount = normalizeAmount(input.timeStep.value)
  const actualWindow = buildActualNarrativeWindow(input)
  const endSeason = SEASON_NAMES[getSeasonForMonth(input.month - 1)] ?? '未知'
  const calendarRule = `项目历法固定为3—5月春季、6—8月夏季、9—11月秋季、12—2月冬季；天气、衣着、农事与社会节律沿用阳历月份，并作为场景背景融入行动与变化。其中${input.month}月称${endSeason}季；异常寒冷或炎热作为该季节中的特殊天气呈现。`

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
      return `${calendarRule}本轮连续推进${amount}个季度（${monthCount}个月），覆盖${formatYearMonth(startMonth)}至${formatYearMonth(endMonth)}，结束节点属于${endSeason}季；环境与社会节律随跨季过程自然变化。`
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
): string {
  const amount = normalizeAmount(timeStep.value)
  const profile = getTimeScaleNarrativeProfile(timeStep)
  const unitLabel: Record<TimeStep['unit'], string> = {
    day: '日',
    month: '月',
    season: '季',
    year: '年',
  }

  return [
    `【时间尺度】当前时间是本轮叙事的结束节点；正文讲述上一叙事节点之后到当前节点之间发生的事情，并从窗口内正在发生的行动、关系或世界变化进入场景。本次推进${amount}${unitLabel[timeStep.unit]}；先读取最近两轮，若它们连续由同一地点、关系、日常动作或能力主导，本轮必须更换至少一项叙事重心，并形成新的目标、阻碍、关系变化或外部回应，不能只换时间继续复述；时间通过变化自然显现。`,
    profile.prompt,
  ].join('')
}
