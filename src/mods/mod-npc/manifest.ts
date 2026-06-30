/**
 * @module manifest.ts
 * @description MOD 身份声明 —— NPC 独立记忆系统
 * @mod mod-npc
 *
 * 创意 #6：NPC 独立记忆系统
 * 多个 AI 驱动的 NPC，各有独立属性实例 + 记忆链 + 行为决策逻辑
 */

import { defineMod } from '@/core'

export default defineMod({
  name: 'mod-npc',
  version: '1.0.0',
  description: 'NPC 独立记忆系统：多 NPC 属性实例化、独立记忆链（关键词+重要性+衰减）、行为决策（交易/战斗/社交/移动）',
  dependencies: ['mod-engine', 'mod-character'],
  provides: ['npc', 'npc-memory', 'npc-behavior', 'npc-attribute'],
  consumes: ['engine', 'character'],
  subsystems: [
    'NPCAttributeSystem',
    'NPCBehaviorSystem',
    'NPCMemorySystem',
  ],
  stores: ['useNPCStore'],
  prompts: ['npc-behavior', 'adaptation-antagonist-prompt'],
  events: {
    emits: [
      'mod-npc:npc-created',
      'mod-npc:npc-died',
      'mod-npc:behavior-triggered',
      'mod-npc:memory-created',
      'mod-npc:relation-changed',
    ],
    listens: ['mod-engine:round-complete'],
  },
})
