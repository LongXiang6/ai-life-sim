/**
 * @module branch-policy.ts
 * @description 命运分支组件 — 流程指令
 * @mod mod-engine
 */

import type { NarrativePromptComponent } from '../../../helpers/narrative-prompt-component-types'

export const branchPolicyComponent: Omit<
  NarrativePromptComponent,
  'assemblyPosition' | 'loadWhen' | 'acceptanceEvidence'
> = {
  id: 'branch-policy',
  title: '命运分支',
  kind: '流程指令',
  lifecycle: '全局常驻',
  authority: '玩家意图',
  order: 70,
  dependsOn: ['语义信号', '分支冷却'],
  exitWhen: '永不退出',
  content: [
    '命运分支只用于改变身份、核心关系、长期目标、关键资源、阵营、存亡等不可逆轨迹的高重要度抉择。',
    '选项只写行动、立场或方向，不承诺成功；分支必须高重要度、不可逆并使用命运或传承语域。',
  ],
}
