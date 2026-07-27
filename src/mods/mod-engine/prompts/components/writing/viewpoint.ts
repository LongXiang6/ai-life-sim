/**
 * @module viewpoint.ts
 * @description 人称与镜头组件 — 写作规则
 * @mod mod-engine
 */

import type { NarrativePromptComponent } from '../../../helpers/narrative-prompt-component-types'

export const viewpointComponent: Omit<
  NarrativePromptComponent,
  'assemblyPosition' | 'loadWhen' | 'acceptanceEvidence'
> = {
  id: 'viewpoint',
  title: '人称与镜头',
  kind: '硬限制',
  lifecycle: '全局常驻',
  authority: '剧情引导',
  order: 40,
  dependsOn: ['角色档案', '角色现状'],
  exitWhen: '永不退出',
  content: [
    '正文全程用第二人称"你"；除直接称呼或消歧外，不用姓名、他、她、主角或角色作叙事主语。',
    '镜头只写你能感知、回忆或合理推断的内容，不写全知旁白、第三人称传记或编年报告；历史原文只继承事实，不能成为本轮的人称、措辞或段落样本。',
  ],
}
