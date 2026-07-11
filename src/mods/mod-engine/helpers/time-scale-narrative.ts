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
  let hint = `【时间尺度】当前时间是本轮叙事的结束节点；正文只写上一叙事节点之后到当前节点之间发生的事。以${unitZh}为单位推进${amount > 1 ? `（本次跨越 ${amount}${unitZh}）` : ''}。`

  switch (unit) {
    case 'day':
      hint += '【单日生活视角】只写这一天内的日常行动、对话、小事件和即时感受；细节可以具体，但不得把数周或数月成果压进一天。天气、衣着、上学/上班与休息安排必须符合当前日期。'
      break
    case 'month':
      hint += '【月度近景视角】概括当月持续变化，再落到一件能代表本月的具体事件；体现数周内的学习、工作、关系或目标进展，不写年度报告，也不把单日琐事夸成整月命运转折。'
      break
    case 'season':
      hint += '【季度中景视角】体现三个月内的阶段性进展、环境与制度变化，再选择一件改变关系、目标或处境的关键节点；结尾落到季度后果，不逐日罗列。'
      break
    case 'year':
      hint += '【年度宏观视角】覆盖一个完整年份：先判断世界大势与人生阶段的年度主线，再用一到两个代表性场景承载长期变化；不要让某一天的鸡毛蒜皮替代全年，也不要逐月记流水账。0岁开场仍只写出生与家世。'
      break
    default:
      hint += '采用更高层级视角：时间越长，越先写时代/势力/家庭结构变化，再选择角色或其所属家庭/势力直接承受的代表性后果；个人镜头应展示长期变化压到具体人身上的代价或机会。'
  }

  hint += '若输出空间不足，优先用短句完成三段和结尾；不要在正文末尾新开对话、冒号、破折号或未解释的新线索。'

  return hint
}
