/**
 * @module global-store.ts
 * @description Zustand 全局 Store —— 聚合跨 MOD 的 App 级状态
 * @mod core
 *
 * 规范来源：mod-specification.md §6.3 Store 分片注册
 *
 * 职责边界：
 *   全局 Store 只持有任何单一 MOD 都不应独占的 App 级状态，
 *   不持有具体 MOD 的数据（各 MOD 数据由 use{Name}Store 独立管理）。
 *
 *   App 级状态：游戏阶段、世界观选择、世界/角色名称等流程控制字段。
 *   MOD 级状态：引擎运行态、角色属性、世界数据等 → 各自 MOD Store。
 */

import { create } from 'zustand'

import type { WorldviewId } from '@/foundation'

/** 游戏阶段 */
export type GamePhase = 'idle' | 'world_build' | 'character_create' | 'simulation' | 'end'

/** 全局 Store 状态结构 */
export interface GlobalState {
  // === MOD 加载 ===
  /** manifest 已解析、路由表已注册（lifecycle 完成前即可渲染 MOD 页） */
  modRoutesReady: boolean
  setModRoutesReady: (ready: boolean) => void
  allModsLoaded: boolean
  setAllModsLoaded: (loaded: boolean) => void

  // === 游戏流程 ===
  gamePhase: GamePhase
  setGamePhase: (phase: GamePhase) => void

  // === 世界设置 ===
  worldviewId: WorldviewId | null
  setWorldviewId: (id: WorldviewId) => void
  worldName: string
  setWorldName: (name: string) => void

  // === 角色 ===
  characterName: string
  setCharacterName: (name: string) => void

  // === 重置 ===
  reset: () => void,
}

const initialState = {
  modRoutesReady: false,
  allModsLoaded: false,
  gamePhase: 'idle' as GamePhase,
  worldviewId: null as WorldviewId | null,
  worldName: '',
  characterName: '',
}

/** 全局 Store */
export const useGlobalStore = create<GlobalState>()((set) => ({
  ...initialState,

  setModRoutesReady: (ready) => set({ modRoutesReady: ready }),

  setAllModsLoaded: (loaded) => set({ allModsLoaded: loaded }),

  setGamePhase: (phase) => set({ gamePhase: phase }),

  setWorldviewId: (id) => set({ worldviewId: id }),

  setWorldName: (name) => set({ worldName: name }),

  setCharacterName: (name) => set({ characterName: name }),

  reset: () => set({ ...initialState }),
}))
