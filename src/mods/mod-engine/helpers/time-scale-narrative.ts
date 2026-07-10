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
      hint += '采用近景/现场视角：写当天发生的一次具体行动、对话或突发状况，强调即时反馈和细节，不需要概括更长时间；收尾优先给出直接结果或新的小问题。天气、衣着和环境必须符合当前月份对应的季节。'
      break
    case 'month':
      hint += '采用中近景视角：先用一句话交代本月压力、机会或关系变化，再落到一件代表性小事件；这件事尽量包含角色行动、具体阻力、可见后果或新线索，少写月度清单式总结和纯心理余味。天气、节令和生活细节必须符合当前自然月份；承接上月已经完成的动作和成长，不得换皮复演最近叙事中的同一场景、动作或结果。'
      break
    case 'season':
      hint += '采用中景视角：体现当前季节带来的环境、制度或人际变化，再选择一件改变关系、目标或处境的关键节点来写；结尾优先落到阶段性后果，而不是主题升华。不得复演最近叙事已经完成的代表事件。'
      break
    case 'year':
      hint += '采用远景选材 + 近景落点：若这是0岁开场，只写出生与家世；其他年份先判断世界大势和人生阶段在这一年的主要压力，再落到一到两个代表性场景，尽量让场景承担行动、阻力与后果，少写年度报告。新一年必须推进角色能力、关系或处境，不得重复上一年的核心事件。'
      break
    default:
      hint += '采用更高层级视角：时间越长，越先写时代/势力/家庭结构变化，再选择角色或其所属家庭/势力直接承受的代表性后果；个人镜头应展示长期变化压到具体人身上的代价或机会。'
  }

  hint += '若输出空间不足，优先用短句完成三段和结尾；不要在正文末尾新开对话、冒号、破折号或未解释的新线索。'

  return hint
}
