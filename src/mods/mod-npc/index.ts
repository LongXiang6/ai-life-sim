/**
 * @module index.ts
 * @description MOD 公共 API 导出 —— P2 NPC 系统
 * @mod mod-npc
 */

export type {
  NpcAvailability,
  NpcIdentity,
  NpcContextState,
  NpcGoalStatus,
  NpcGoal,
  NpcBehaviorRecord,
  NpcMemorySourceKind,
  NpcMemory,
  NpcMemoryCompression,
  NpcSystemPersistenceState,
} from './types'

export { useNpcSystemStore, selectNpcSystemPersistenceState } from './store'
