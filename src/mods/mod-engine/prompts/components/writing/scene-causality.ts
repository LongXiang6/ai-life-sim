/**
 * @module scene-causality.ts
 * @description 现场与因果组件 — 写作规则
 * @mod mod-engine
 */

import type { NarrativePromptComponent } from '../../../helpers/narrative-prompt-component-types'

export const sceneCausalityComponent: Omit<
  NarrativePromptComponent,
  'assemblyPosition' | 'loadWhen' | 'acceptanceEvidence'
> = {
  id: 'scene-and-causality',
  title: '现场与因果',
  kind: '写作规则',
  lifecycle: '全局常驻',
  authority: '剧情引导',
  order: 30,
  dependsOn: ['本轮引导'],
  exitWhen: '永不退出',
  content: [
    '正文段落数量自由，按故事需要自然分段；变化起点、行动与发展、后果与新局面应连续推进同一因果主线。',
    '至少保留一个可感知现场、具体动作或对话、人物回应和可见后果；平静轮可由休整、掌握、认可、关系回暖或成功兑现形成变化。',
    '若本轮按年或更长跨度推进，正文仍只选择一个代表性现场；跨季只作简短过渡，不得拼接成逐季年表。',
    '禁止流水账、年度报告、空泛感悟、同义反复、互不相干的生活切片和为凑字堆景物；结尾必须完整。',
  ],
}
