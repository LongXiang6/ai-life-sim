/**
 * @module store.ts
 * @description 引擎 Zustand Store —— 全局暴露引擎状态（含压缩统计 + 流式叙事）
 * @mod mod-engine
 */

'use client'

import { create, } from 'zustand'
import { persist, } from 'zustand/middleware'

import { DEFAULT_ENGINE_CONFIG, getSeasonForMonth, } from './constants'

import type { EngineState, SimulationStatus, NarrativeChunk, CompressionStats, CharacterCreation, } from './types'
import type { CompressedSummaries, } from '@/foundation'
import type { NPCInteractionRecord, } from './subsystems/core-memory-system'

interface EngineStore extends EngineState {
  /** 流式叙事实时内容（正在流式传输中的文本） */
  streamingNarrative: string
  /** 流式叙事错误信息 */
  narrativeError: string | null

  setStatus: (status: SimulationStatus) => void
  setTimeStep: (step: EngineState['timeStep']) => void
  appendNarrative: (chunk: NarrativeChunk) => void
  setCurrentNarrative: (text: string) => void
  advanceRound: (round: EngineState['round']) => void
  setCompressionStats: (stats: CompressionStats) => void
  setCompressedSummaries: (summaries: CompressedSummaries) => void

  /** 追加流式叙事片段 */
  appendStreamingChunk: (chunk: string) => void
  /** 流式叙事完成（将 streamingNarrative 写入 currentNarrative） */
  finalizeNarrative: () => void
  /** 设置叙事错误 */
  setNarrativeError: (error: string | null) => void

  /** 设置上次自动保存的回合数 */
  setLastAutoSaveRound: (round: number) => void

  /** 核心记忆 NPC 关系网持久化 */
  coreMemoryNpcMap: Record<string, NPCInteractionRecord[]>
  setCoreMemoryNpcMap: (map: Record<string, NPCInteractionRecord[]>) => void

  /** 下轮强制分叉（更多 → 分支） */
  forceBranchNext: boolean
  setForceBranchNext: (value: boolean) => void
  /** 已解决的分叉：叙事片段 id → 玩家选择文本 */
  resolvedBranches: Record<string, string>
  resolveBranch: (id: string, choice: string) => void

  reset: () => void,
}

const initialRound = {
  year: 1,
  season: getSeasonForMonth(0),
  month: 0,
  day: 0,
  dayOfYear: 1,
  totalDays: 365,
  eraName: '创世纪元',
  eraYear: 1,
  reignTitle: '建武',
  reignYear: 1,
} as const

const initialState = {
  status: 'idle' as SimulationStatus,
  round: { ...initialRound, },
  timeStep: DEFAULT_ENGINE_CONFIG.timeStep,
  totalRounds: 0,
  narrativeHistory: [] as NarrativeChunk[],
  currentNarrative: '',
  compressionStats: { l1Count: 0, l2Count: 0, l3Count: 0, l4Count: 0, lastAt: 0, },
  compressedSummaries: { summaries: [], } as CompressedSummaries,
  lastAutoSaveRound: 0,
  streamingNarrative: '',
  narrativeError: null as string | null,
  coreMemoryNpcMap: {} as Record<string, NPCInteractionRecord[]>,
  forceBranchNext: false,
  resolvedBranches: {} as Record<string, string>,
  characterCreations: [] as CharacterCreation[],
}

export const useEngineStore = create<EngineStore>()(
  persist(
    (set,) => ({
      ...initialState,

      setStatus: (status,) => set({ status, },),

      setTimeStep: (timeStep,) => set({ timeStep, },),

      appendNarrative: (chunk,) =>
        set((state,) => {
          const enriched = chunk.id
            ? chunk
            : { ...chunk, id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8) }
          return { narrativeHistory: [...state.narrativeHistory, enriched], }
        }),

      setCurrentNarrative: (text,) => set({ currentNarrative: text, },),

      advanceRound: (round,) =>
        set((state,) => ({
          round,
          totalRounds: state.totalRounds + 1,
        }),),

      setCompressionStats: (stats,) => set({ compressionStats: stats, },),

      setCompressedSummaries: (summaries,) => set({ compressedSummaries: summaries, },),

      appendStreamingChunk: (chunk,) =>
        set((state,) => ({
          streamingNarrative: state.streamingNarrative + chunk,
        }),),

      finalizeNarrative: () =>
        set((state,) => ({
          currentNarrative: state.streamingNarrative,
        }),),

      setNarrativeError: (error,) => set({ narrativeError: error, },),

      setLastAutoSaveRound: (round,) => set({ lastAutoSaveRound: round, },),

      setCoreMemoryNpcMap: (map,) => set({ coreMemoryNpcMap: map, },),

      setForceBranchNext: (forceBranchNext,) => set({ forceBranchNext, },),

      resolveBranch: (id, choice,) =>
        set((state,) => {
          const resolvedBranches = { ...state.resolvedBranches, [id]: choice }
          const narrativeHistory = state.narrativeHistory.map((chunk) =>
            chunk.id === id ? { ...chunk, resolvedChoice: choice } : chunk,
          )
          return { resolvedBranches, narrativeHistory, forceBranchNext: false }
        }),

      reset: () =>
        set({
          ...initialState,
          round: { ...initialRound, },
        },),
    }),
    {
      name: 'mod-engine:persist:engine-state',
      version: 2,
      migrate: (persistedState: unknown, version: number) => {
        if (version < 2) {
          const old = persistedState as Record<string, unknown>
          // 将旧格式的数字键 resolvedBranches 转换为字符串键
          const oldBranches = old.resolvedBranches as Record<string, string> | undefined
          if (oldBranches && typeof oldBranches === 'object') {
            // 旧数据中 numeric key 保持不动也能用，但为了干净迁移，转为空对象（旧 chunk 无 id 无法映射）
            old.resolvedBranches = {}
          }
        }
        return persistedState as EngineStore
      },
      partialize: (state,) => {
        const { setStatus: _a, appendNarrative: _b, setCurrentNarrative: _c, advanceRound: _d, setCompressionStats: _e, setCompressedSummaries: _f, appendStreamingChunk: _g, finalizeNarrative: _h, setNarrativeError: _i, setLastAutoSaveRound: _j, setCoreMemoryNpcMap: _n, setForceBranchNext: _fb, resolveBranch: _rb, reset: _o, ...rest } = state
        // 仅持久化最近 50 条叙事历史，防止 localStorage 膨胀
        if (rest.narrativeHistory && rest.narrativeHistory.length > 50) {
          rest.narrativeHistory = rest.narrativeHistory.slice(-50)
        }
        return rest
      },
    },
  ),
)
