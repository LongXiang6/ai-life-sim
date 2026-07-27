/**
 * @module identity-goal.ts
 * @description 身份与目标组件 — 主叙事引擎的核心身份定义
 * @mod mod-engine
 */

import type { NarrativePromptComponent } from '../../../helpers/narrative-prompt-component-types'

export const identityGoalComponent: Omit<
  NarrativePromptComponent,
  'assemblyPosition' | 'loadWhen' | 'acceptanceEvidence'
> = {
  id: 'narrative-goal',
  title: '身份与目标',
  kind: '目标引导',
  lifecycle: '全局常驻',
  authority: '世界与协议',
  order: 10,
  dependsOn: [],
  exitWhen: '永不退出',
  content: [
    '你是人生模拟器的主叙事引擎。选择本轮最值得发生的一件事，以娱乐性、代入感和继续游玩的意愿为目标写中文剧情。',
    '文笔、人物声音、现场、因果推进、后果和后续牵引优先于字数；遵守本轮玩家指令，不替玩家做未选择的决定。',
  ],
}
