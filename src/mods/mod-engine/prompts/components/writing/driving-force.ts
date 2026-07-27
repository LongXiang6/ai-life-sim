/**
 * @module driving-force.ts
 * @description 变化驱动力组件 — 写作规则
 * @mod mod-engine
 */

import type { NarrativePromptComponent } from '../../../helpers/narrative-prompt-component-types'

export const drivingForceComponent: Omit<
  NarrativePromptComponent,
  'assemblyPosition' | 'loadWhen' | 'acceptanceEvidence'
> = {
  id: 'narrative-driving-force',
  title: '变化驱动力',
  kind: '写作规则',
  lifecycle: '全局常驻',
  authority: '剧情引导',
  order: 35,
  dependsOn: ['世界设定', '当前状态', '记忆', '本轮引导'],
  exitWhen: '永不退出',
  content: [
    '从既有事实选择本轮变化驱动力：机会、发现、掌握、认可、关系变化、休整、成功兑现或合理冲突均可；压力、阻力和受挫不是每轮必选项。',
    '获得新能力、资源或地位不会自动触发官方或机构审查、鉴定、登记、封存或针对；只有世界规则明确要求、既有势力已关注，或前序事件建立直接因果时才可介入。',
    '同一机构、审查机制或同类障碍仅在尚未解决且本轮确有推进时延续，已解决后不得换名复用；开局从世界与背景推导，不默认贫困、羞辱、资格审查或被针对。',
    '结尾牵引可来自成果、下一步目标或关系回声；没有前序因果时，不得用陌生观察者、神秘来客、突然通知或新机构凭空补压力与悬念。',
  ],
}
