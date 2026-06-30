/**
 * @module time-scale-narrative.ts
 * @description 时间步进 → 叙事视角提示（对齐废弃项目 prompt-composer）
 * @mod mod-engine
 */

import type { TimeStep } from '@/foundation'

/** 根据当前时间步进生成叙事视角指示（注入 Prompt） */
export function buildTimeScaleNarrativeHint(timeStep: TimeStep): string {
  const amount = timeStep.value ?? 1
  const unit = timeStep.unit

  const unitLabel: Record<string, string> = {
    day: '日',
    month: '月',
    season: '季',
    year: '年',
    decade: '十年',
    century: '百年',
  }

  const unitZh = unitLabel[unit] ?? unit
  let hint = `【时间尺度】以${unitZh}为单位推进${amount > 1 ? `（本次跨越 ${amount}${unitZh}）` : ''}。`

  switch (unit) {
    case 'day':
      hint += '请细致叙述这一天的行动、对话与感官细节，微观视角。'
      break
    case 'month':
      hint += '请叙述这段时间的日常细节与微小变化，偏生活流视角。'
      break
    case 'season':
      hint += '请叙述这一季内的季节变化、活动与人物互动，中距视角。'
      break
    case 'year':
      hint += '请概括这一年内的重要事件与发展趋势，避免逐日流水账，宏观视角。'
      break
    default:
      hint += '叙事粒度须与时间步进匹配。'
  }

  return hint
}
