/**
 * @module authority-order.ts
 * @description 事实与裁决顺序组件 — 定义信息优先级
 * @mod mod-engine
 */

import type { NarrativePromptComponent } from '../../../helpers/narrative-prompt-component-types'

export const authorityOrderComponent: Omit<
  NarrativePromptComponent,
  'assemblyPosition' | 'loadWhen' | 'acceptanceEvidence'
> = {
  id: 'authority-order',
  title: '事实与裁决顺序',
  kind: '硬限制',
  lifecycle: '全局常驻',
  authority: '世界与协议',
  order: 20,
  dependsOn: ['世界设定', '当前状态', '记忆'],
  exitWhen: '永不退出',
  content: [
    '事实优先级：更具体、更新的玩家设定 > 世界与模组规则 > 当前状态、记忆和近期经历。',
    '不得引入尚未成立的能力、关系或资源；普通命格与已装备轮回天赋效果每轮持续生效，但不能绕过条件、代价、死亡、世界规则或玩家选择。',
  ],
}
