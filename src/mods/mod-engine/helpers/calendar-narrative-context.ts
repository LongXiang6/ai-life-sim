/**
 * @module calendar-narrative-context.ts
 * @description 当前时间粒度的节假日、学期与工作日合理性提示
 * @mod mod-engine
 */

import { remote } from '@/core'
import type { TimeStep } from '@/foundation'
import { buildCanonicalCalendarNarrativeHint } from './time-scale-narrative'

export interface CalendarNarrativeContextInput {
  timeStep: TimeStep
  calendarYear: number
  month: number
  day: number
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

/**
 * 通用历法护栏由引擎提供；mod-culture 若有世界配置写入的节日，再通过 Remote Interface
 * 追加精确月/日信息。这样无需启用完整文化模拟，也不让 mod-engine 静态依赖下游 MOD。
 */
export function buildCalendarNarrativeContext(input: CalendarNarrativeContextInput): string {
  const canonicalSpanRule = buildCanonicalCalendarNarrativeHint(input)
  const hasActualWindow = input.previousNode !== undefined
    && typeof input.daysPassed === 'number'
    && input.daysPassed > 0
  let granularityRule: string
  switch (input.timeStep.unit) {
    case 'day':
      granularityRule = `写上学、上班或营业前，先依据同条世界设定与地区判断节日、寒暑假/学期、休息日和社会作息；无法确认时不要武断写成普通上学日或工作日。`
      break
    case 'month':
      granularityRule = hasActualWindow
        ? '须依据上述实际时间窗口中的节日、假期、学期与行业周期，选择能代表这段阶段变化而非重复旧月份的事件。'
        : '须考虑覆盖月份内的节日、假期、学期与行业周期，选择能代表阶段变化而非单个任意工作日的事件。'
      break
    case 'season':
      granularityRule = hasActualWindow
        ? '须体现上述实际时间窗口对应的节庆、学期阶段、农事或生产节律，跨季度时同步改变这些节律。'
        : '须体现覆盖季度在当前世界与地区对应的节庆、学期阶段、农事或生产节律，跨季度时同步改变这些节律。'
      break
    case 'year':
    default:
      granularityRule = hasActualWindow
        ? '节日与校历只作为上述实际窗口的节奏线索，不要让单日琐事代表整段跨度，也不要把已完成年份的状态静止复制到当前节点。'
        : '节日与校历只作为年度或多年节奏的一部分，不要让单日琐事代表全年，也不要让同一年的状态静止覆盖多年。'
      break
  }

  let configuredFestival: string | undefined
  try {
    configuredFestival = remote.tryCall<string>(
      'mod-culture',
      'buildCultureCalendarNarrativeContext',
      input,
    )
  } catch (error) {
    console.warn('[CalendarContext] 读取 mod-culture 节日上下文失败:', error)
  }

  const worldviewRule = '真实或类现实世界应按角色所在国家/地区推断节假日、校历与工作制度；非现实世界遵循 worldSetting 中的历法、宗教、制度和社会节律，不套用现实国家模板。'

  return ['【历法与社会作息】', canonicalSpanRule, worldviewRule, granularityRule, configuredFestival]
    .filter(Boolean)
    .join('\n')
}
