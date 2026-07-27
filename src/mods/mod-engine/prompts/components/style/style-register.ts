/**
 * @module style-register.ts
 * @description 文风与叙事语域组件 — 风格规则
 * @mod mod-engine
 */

import type { NarrativePromptComponent } from '../../../helpers/narrative-prompt-component-types'

export const styleRegisterComponent: Omit<
  NarrativePromptComponent,
  'assemblyPosition' | 'loadWhen' | 'acceptanceEvidence'
> = {
  id: 'style-register',
  title: '文风与叙事语域',
  kind: '写作规则',
  lifecycle: '全局常驻',
  authority: '文风参考',
  order: 60,
  dependsOn: ['叙事风格', '叙事基调', '语义信号'],
  exitWhen: '永不退出',
  content: [
    '基础文风只调节镜头和措辞；生活用于日常，命运用于不可逆轨迹变化，传承只用于有既有因果支撑的高潮或收束。',
    '时间跨度不能让语域自动升级；不用宏大词堆砌代替因果。',
  ],
}
