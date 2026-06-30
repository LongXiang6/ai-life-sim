/**
 * @module constants.ts
 * @description mod-npc 常量
 * @mod mod-npc
 */

import type { NPCAttributes } from './types'

/** 默认 NPC 属性模板 */
export const DEFAULT_NPC_ATTRIBUTES: NPCAttributes = {
  physique: 3,
  mind: 3,
  talentAptitude: 3,
  charisma: 3,
  resources: 3,
  loyalty: 0,
  aggression: 20,
  greed: 20,
  sociability: 30,
}
