/**
 * @module time-scale-narrative.ts
 * @description 时间步进 → 叙事视角提示（对齐废弃项目 prompt-composer）
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
    const granularityRule = input.timeStep.unit === 'year'
      ? '长时段只作为同一因果主线的过渡，正文仍须落到代表性现场。'
      : input.timeStep.unit === 'season'
        ? '当地时节变化须服从两端节点和实际经过天数，不得擅自换算成现实季度。'
        : input.timeStep.unit === 'month'
          ? '月份变化须服务于同一段因果推进，不得套用现实月份长度或节气。'
          : '日内变化须符合两端当地日期之间实际经过的天数。'
    const fallbackWindow = actualWindow
      ?? `本轮结束节点为${formatCalendarNode(input)}，按${amount}${input.timeStep.unit === 'day' ? '日' : input.timeStep.unit === 'month' ? '月' : input.timeStep.unit === 'season' ? '时节' : '年'}粒度推进。`
    return `${calendarRule}${fallbackWindow}${granularityRule}`
  }

  const endSeason = SEASON_NAMES[getSeasonForMonth(input.month - 1)] ?? '未知'
  const calendarRule = `项目历法固定为3—5月春季、6—8月夏季、9—11月秋季、12—2月冬季；天气、衣着、农事与正文季节必须服从阳历月份，不得自行套用其他季节划分。其中${input.month}月必须称${endSeason}季；气温可以异常寒冷或炎热，但不得把该月改称其他季节。`

  if (actualWindow) {
    const granularityRule = input.timeStep.unit === 'season'
      ? '季节变化须服从两端节点之间实际经过的月份，不得把多个季度写成一个静止季节。'
      : input.timeStep.unit === 'year'
        ? '年度或多年变化只作为同一因果主线的过渡，正文仍须落到一个代表性现场。'
        : input.timeStep.unit === 'month'
          ? '月份变化须服务于同一段因果推进，不得把已经完成的月份重新当作当前事件。'
          : '日内变化须符合两端日期之间实际经过的天数。'
    return `${calendarRule}${actualWindow}${granularityRule}`
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
      const coverageRule = amount === 1
        ? '年度背景只需用一句交代同一主线在年内的积累，正文主体锁定一个代表性现场；不得按季节拆成多个独立场景。'
        : '多年推进必须表现起点、过渡阶段与结束节点的变化，不能只描写目标年份。'
      return `${calendarRule}本轮覆盖${span}；${coverageRule}`
    }
  }
}

/** 根据当前时间步进生成叙事视角指示（注入 Prompt） */
export function buildTimeScaleNarrativeHint(
  timeStep: TimeStep,
  calendar?: { usesCanonicalSolarSeasons?: boolean; calendarName?: string },
): string {
  const amount = normalizeAmount(timeStep.value)
  const unit = timeStep.unit
  const usesLocalSeason = calendar?.usesCanonicalSolarSeasons === false

  const unitLabel: Record<string, string> = {
    day: '日',
    month: '月',
    season: usesLocalSeason ? '当地时节' : '季',
    year: '年',
    decade: '十年',
    century: '百年',
  }

  const unitZh = unitLabel[unit] ?? unit
  let hint = `【时间尺度】当前时间是本轮叙事的结束节点；正文只写上一叙事节点之后到当前节点之间发生的事。以${unitZh}为单位推进${amount > 1 ? `（本次跨越 ${amount}${unitZh}）` : ''}。`

  switch (unit) {
    case 'day':
      hint += amount === 1
        ? '【单日生活视角】只写这一天内的日常行动、对话、小事件和即时感受；细节可以具体，但不得把数周或数月成果压进一天。'
        : `【连续日近景视角】完整覆盖连续${amount}天：写出最初状况、期间一次关键变化与结束节点的直接结果，不得把多日过程压成目标日当天突然发生。`
      break
    case 'month':
      hint += amount === 1
        ? '【月度近景视角】概括当月持续变化，再落到一件能代表本月的具体事件；体现数周内的学习、工作、关系或目标进展，不写年度报告，也不把单日琐事夸成整月命运转折。'
        : `【跨月阶段视角】完整覆盖连续${amount}个月：交代起点状态或变化契机、期间的积累或转折，以及当前月的阶段性后果；不得只写最后一个月。`
      break
    case 'season':
      hint += usesLocalSeason
        ? amount === 1
          ? `【当地时节中景视角】遵循${calendar?.calendarName || '当地历法'}的实际时间窗口，体现本时节的环境、制度或关系变化，再选择一个改变处境的关键节点；不得换算成现实三个月季度。`
          : `【跨当地时节中景视角】完整覆盖连续${amount}个当地时节：依据实际时间窗口分阶段表现环境、制度或关系变化，再用代表性节点串起因果；不得套用现实季度。`
        : amount === 1
          ? '【季度中景视角】体现三个月内的阶段性进展、环境与制度变化，再选择一件改变关系、目标或处境的关键节点；结尾落到季度后果，不逐日罗列。'
          : `【跨季度中景视角】完整覆盖连续${amount}个季度：明确季节、制度或关系如何分阶段变化，再用代表性节点串起因果；不得把多个季度写成同一季节的一幕。`
      break
    case 'year':
      if (amount === 1) {
        hint += '【年度单场景视角】先判断世界大势与人生阶段的年度主线，但正文主体只锁定一个能体现本轮主线的具体现场。年度积累或季节变化最多用一句过渡交代；不得不断换季、换地点或换任务，必须连续写同一事件的触发、行动与后果。0岁开场仍只写出生与家世。'
      } else if (amount < 10) {
        hint += `【多年阶段视角】完整覆盖连续${amount}年，而非只写目标年份。依次交代起点阶段与主要变化驱动力、数年间的积累或转折、当前年份的关系/身份/目标后果；所有代表性节点必须服务同一主线，用因果串联，不逐年记账或拼接独立生活切片。`
      } else {
        hint += `【长期人生/时代视角】完整覆盖连续${amount}年，而非只写目标年份。必须体现人生阶段、核心关系、身份资源或时代环境至少一项跨阶段改变；依次写清起点格局、期间决定性转折、当前节点及遗留后果，不逐年罗列。`
      }
      break
    default:
      hint += '采用更高层级视角：时间越长，越先写时代/势力/家庭结构变化，再选择角色或其所属家庭/势力直接承受的代表性后果；个人镜头应展示长期变化压到具体人身上的代价或机会。'
  }

  hint += '正文段落数量自由，但必须沿同一时间跨度内的因果主线写清起点、推进与后果，不拼接互不相干的事件或生活切片。首句不要使用“这一年”“这一月”“这一天”等泛指时间套语，也不要复用上一轮起句结构；直接进入动作、对话、感官、冲突或环境变化，确需时间锚时使用“当前时间”中的具体纪年、季节、月日。字数只作节奏参考，不得为了控字压扁好故事、删掉关键行动或重复填充；需要展开就完整交代，需要收束就自然结束，不要在末尾新开未完成的对话、冒号、破折号或未解释的新线索。'

  return hint
}
