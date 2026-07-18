/**
 * @module index.ts
 * @description MOD 公共 API 导出 —— NPC 独立记忆系统
 * @mod mod-npc
 */

// 类型
export type {
  NPCAttributes,
  NPCPersonality,
  NPCBehaviorType,
  NPCBehaviorRecord,
  NPCRelation,
  NPCMemory,
  MemoryImportance,
  NPCState,
  NPCSummary,
  NPCSystemSummary,
} from './types'

// 常量
export {
  MEMORY_RETENTION,
} from './types'

export { DEFAULT_NPC_ATTRIBUTES } from './constants'

// Store
export { useNPCStore } from './store'

// Prompts
export { npcBehaviorPrompt, SYSTEM_PROMPT as NPC_BEHAVIOR_SYSTEM_PROMPT } from './prompts/npc-behavior'
