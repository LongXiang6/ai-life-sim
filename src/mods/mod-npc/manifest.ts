/**
 * @module manifest.ts
 * @description MOD 身份声明 —— NPC 连续身份与社会行为系统
 * @mod mod-npc
 *
 * P2：单一 NPC 系统拥有身份、当地状态、目标、行为和主观记忆。
 */

import { defineMod } from '@/core'

export default defineMod({
  name: 'mod-npc',
  order: 410,
  version: '2.0.0',
  description: 'NPC 连续身份、当地状态、目标、行为记录和独立主观记忆',
  dependencies: ['mod-engine', 'mod-world', 'mod-social', 'mod-history-dynamics'],
  provides: ['npc', 'npc-system'],
  consumes: ['world-entity', 'relationship-system', 'historical-event-ledger'],
  subsystems: ['NpcSystem'],
  secondaryPublicEntries: ['npc-system-api.ts'],
  stores: ['useNpcSystemStore'],
  events: { emits: [], listens: [] },
})
