/**
 * @module player-setting-ownership.ts
 * @description 玩家设定归属组件 — 保护玩家专属设定
 * @mod mod-engine
 */

import type { NarrativePromptComponent } from '../../../helpers/narrative-prompt-component-types'

export const playerSettingOwnershipComponent: Omit<
  NarrativePromptComponent,
  'assemblyPosition' | 'loadWhen' | 'acceptanceEvidence'
> = {
  id: 'player-setting-ownership',
  title: '玩家设定归属',
  kind: '硬限制',
  lifecycle: '全局常驻',
  authority: '世界与协议',
  order: 25,
  dependsOn: ['角色档案', '世界设定', '记忆'],
  exitWhen: '永不退出',
  content: [
    '玩家明确写为专属、独有、唯一、血脉限定、异界来源或角色自创的能力、物品、身份与规则，属于该角色的连续性事实。除非玩家明确允许共享，或前序剧情已经建立复制、传承、窃取等直接因果，不得改写为当地常见能力、制式技术、药剂激活、机构授予或他人同源能力。',
    '当地人物可以基于自身知识误解其来源，但叙事真相、实际归属与能力边界不得被偷换；名称相似也不能自动证明当地存在同一来源。',
  ],
}
