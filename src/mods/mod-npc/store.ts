'use client'

/**
 * @module useNPCStore
 * @description mod-npc Zustand Store —— NPC 状态管理
 * @mod mod-npc
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import type {
  NPCState,
  NPCSummary,
  NPCSystemSummary,
  NPCBehaviorRecord,
} from './types'

interface NPCStore {
  /** 所有 NPC（按 ID 索引） */
  npcs: Record<string, NPCState>
  /** 行为事件（跨 NPC 的完整全局记录） */
  recentGlobalEvents: string[]

  /** 添加 NPC */
  addNPC: (npc: NPCState) => void
  /** 移除 NPC */
  removeNPC: (id: string) => void
  /** 更新 NPC */
  updateNPC: (id: string, partial: Partial<NPCState>) => void
  /** 标记 NPC 死亡 */
  killNPC: (id: string, deathYear: number) => void
  /** 添加行为记录 */
  addBehavior: (npcId: string, behavior: NPCBehaviorRecord) => void
  /** 添加全局事件 */
  addGlobalEvent: (event: string) => void
  /** 获取 NPC 摘要列表（注入 Prompt） */
  getNPCSummaries: (characterId: string) => NPCSummary[]
  /** 获取系统汇总（注入 Prompt） */
  getSystemSummary: (characterId: string) => NPCSystemSummary
  /** 获取存活的 NPC 数量 */
  getAliveCount: () => number
  /** 获取所有存活的 NPC ID */
  getAliveNPCIds: () => string[]
  /** 根据 ID 获取 NPC */
  getNPC: (id: string) => NPCState | undefined
  /** 设置 NPC 列表 */
  setNPCs: (npcs: Record<string, NPCState>) => void

  reset: () => void
}

const initialState = {
  npcs: {} as Record<string, NPCState>,
  recentGlobalEvents: [] as string[],
}

export const useNPCStore = create<NPCStore>()(
  persist(
    (set, get) => ({
      ...initialState,

      addNPC: (npc) => {
        const { npcs } = get()
        set({ npcs: { ...npcs, [npc.id]: npc } })
      },

      removeNPC: (id) => {
        const { npcs } = get()
        const { [id]: _removed, ...rest } = npcs
        set({ npcs: rest })
      },

      updateNPC: (id, partial) => {
        const { npcs } = get()
        const npc = npcs[id]
        if (!npc) return
        set({ npcs: { ...npcs, [id]: { ...npc, ...partial } } })
      },

      killNPC: (id, deathYear) => {
        const { npcs } = get()
        const npc = npcs[id]
        if (!npc || !npc.alive) return
        set({
          npcs: {
            ...npcs,
            [id]: { ...npc, alive: false, deathYear, currentBehavior: 'idle' },
          },
        })
      },

      addBehavior: (npcId, behavior) => {
        const { npcs } = get()
        const npc = npcs[npcId]
        if (!npc) return
        const recentBehaviors = [behavior, ...npc.recentBehaviors]
        set({
          npcs: {
            ...npcs,
            [npcId]: { ...npc, recentBehaviors },
          },
        })
      },

      addGlobalEvent: (event) => {
        const { recentGlobalEvents } = get()
        set({
          recentGlobalEvents: [event, ...recentGlobalEvents],
        })
      },

      getNPCSummaries: (characterId) => {
        const { npcs } = get()
        return Object.values(npcs)
          .filter((n) => n.alive)
          .map((n) => {
            const playerRelation = n.relations.find((r) => r.targetId === characterId)
            return {
              id: n.id,
              name: n.name,
              alive: n.alive,
              age: n.age,
              description: `${n.name}，${n.age}岁，${n.gender === 'male' ? '男' : '女'}，${n.personality.traits.join('、')}`,
              relationToPlayer: playerRelation
                ? `${playerRelation.type}，好感度 ${playerRelation.affinity}`
                : '无直接关系',
            }
          })
      },

      getSystemSummary: (characterId) => {
        const { npcs, recentGlobalEvents } = get()
        const aliveNPCs = Object.values(npcs).filter((n) => n.alive)
        const keyNPCs = aliveNPCs
          .filter((n) => n.isKeyNPC)
          .map((n) => {
            const playerRelation = n.relations.find((r) => r.targetId === characterId)
            return {
              id: n.id,
              name: n.name,
              alive: n.alive,
              age: n.age,
              description: `${n.name}（${n.personality.traits.join('、')}）`,
              relationToPlayer: playerRelation
                ? `${playerRelation.type}·好感${playerRelation.affinity}`
                : '无关',
            }
          })
        return {
          totalNPCs: Object.keys(npcs).length,
          aliveNPCs: aliveNPCs.length,
          keyNPCs,
          recentEvents: [...recentGlobalEvents],
        }
      },

      getAliveCount: () => {
        return Object.values(get().npcs).filter((n) => n.alive).length
      },

      getAliveNPCIds: () => {
        return Object.values(get().npcs)
          .filter((n) => n.alive)
          .map((n) => n.id)
      },

      getNPC: (id) => {
        return get().npcs[id]
      },

      setNPCs: (npcs) => set({ npcs }),

      reset: () => set({ ...initialState }),
    }),
    {
      name: 'mod-npc:persist:npc-state',
      version: 2,
      migrate: (persistedState: unknown, version: number) => {
        if (!persistedState || typeof persistedState !== 'object') return persistedState as NPCStore
        if (version >= 2) return persistedState as NPCStore
        const { maxNPCs: _legacyCap, ...rest } = persistedState as Record<string, unknown>
        return rest as unknown as NPCStore
      },
      partialize: (state) => {
        const {
          addNPC: _a, removeNPC: _b, updateNPC: _c, killNPC: _d,
          addBehavior: _e, addGlobalEvent: _f, getNPCSummaries: _g,
          getSystemSummary: _h, getAliveCount: _i, getAliveNPCIds: _j,
          getNPC: _k, setNPCs: _l, reset: _m,
          ...rest
        } = state
        return rest
      },
    },
  ),
)
