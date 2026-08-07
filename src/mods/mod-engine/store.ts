/**
 * Purpose: Expose the engine Zustand Store for committed simulation state and visible narrative projections.
 * Owner: mod-engine
 * Responsibility: Own public engine state and actions without duplicating Orchestrator-only round preparation.
 *
 * @module store.ts
 * @description 引擎 Zustand Store —— 暴露已提交状态、即时正文投影与回合错误
 * @mod mod-engine
 */

'use client'

import { create, } from 'zustand'
import { persist, } from 'zustand/middleware'

import { DEFAULT_ENGINE_CONFIG, getSeasonForMonth, } from './constants'

import type { EngineState, SimulationStatus, NarrativeChunk, CompressionStats, CharacterCreation, } from './types'
import {
  createNarrativeLifeRunId,
  summarizeNarrativeHistoryRepetition,
  summarizeNarrativeRepetitionMetrics,
} from './helpers/narrative-repetition-metrics'
import type { CompressedSummaries, } from '@/foundation'
import type { LegendaryEncounterProjection } from '@/core/player-content/player-content-contract'

export type PendingNarrativeStatus = 'pending' | 'committing' | 'failed'

/** 故事已返回但整轮尚未原子提交的非持久化页面投影。 */
export interface PendingNarrative {
  executionId: string
  roundSequence: number
  text: string
  timestamp: number
  status: PendingNarrativeStatus
  statusCode: string
  error?: string
}

interface EngineStore extends EngineState {
  /** 整轮叙事或结算错误信息 */
  narrativeError: string | null

  /** 正文即时展示投影；不进入存档或 Zustand 持久化。 */
  pendingNarrative: PendingNarrative | null

  setStatus: (status: SimulationStatus) => void
  setTimeStep: (step: EngineState['timeStep']) => void
  appendNarrative: (chunk: NarrativeChunk) => void
  setCurrentNarrative: (text: string) => void
  advanceRound: (round: EngineState['round']) => void
  setCompressionStats: (stats: CompressionStats) => void
  setCompressedSummaries: (summaries: CompressedSummaries) => void

  /** 设置叙事错误 */
  setNarrativeError: (error: string | null) => void
  setPendingNarrative: (pending: PendingNarrative) => void
  updatePendingNarrative: (
    executionId: string,
    status: PendingNarrativeStatus,
    statusCode: string,
    error?: string,
  ) => void
  clearPendingNarrative: (executionId?: string) => void

  /** 设置上次自动保存的回合数 */
  setLastAutoSaveRound: (round: number) => void

  /** 下轮强制分叉（更多 → 分支） */
  forceBranchNext: boolean
  setForceBranchNext: (value: boolean) => void
  /** 已解决的分叉：叙事片段 id → 玩家选择文本 */
  resolvedBranches: Record<string, string>
  resolveBranch: (id: string, choice: string) => void

  setLegendaryEncounterSelection: (
    lifeRunId: string,
    encounter: LegendaryEncounterProjection | null,
  ) => void
  markLegendaryEncounterInjected: (round: number) => void

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
  lifeRunId: createNarrativeLifeRunId(),
  status: 'idle' as SimulationStatus,
  round: { ...initialRound, },
  timeStep: DEFAULT_ENGINE_CONFIG.timeStep,
  totalRounds: 0,
  narrativeHistory: [] as NarrativeChunk[],
  currentNarrative: '',
  compressionStats: { l1Count: 0, l2Count: 0, l3Count: 0, lastAt: 0, },
  compressedSummaries: { summaries: [], } as CompressedSummaries,
  lastAutoSaveRound: 0,
  narrativeError: null as string | null,
  pendingNarrative: null as PendingNarrative | null,
  forceBranchNext: false,
  resolvedBranches: {} as Record<string, string>,
  characterCreations: [] as CharacterCreation[],
  storyRepetitionStats: summarizeNarrativeRepetitionMetrics([]),
  legendaryEncounter: undefined,
  legendaryEncounterCheckedForLifeRunId: undefined,
}

export const ENGINE_STORE_SCHEMA_VERSION = 6

/** 供 Zustand rehydrate 与持久化回归共享的纯迁移函数。 */
export function migrateEnginePersistedState(
  persistedState: unknown,
  version: number,
): Record<string, unknown> {
  const old = persistedState && typeof persistedState === 'object' && !Array.isArray(persistedState)
    ? { ...(persistedState as Record<string, unknown>) }
    : {}
  if (version < 2) {
    // 旧 chunk 没有稳定 id，数字键 resolvedBranches 无法可靠映射。
    old.resolvedBranches = {}
  }
  if (version < ENGINE_STORE_SCHEMA_VERSION) {
    const history = Array.isArray(old.narrativeHistory)
      ? old.narrativeHistory as Array<{ repetitionMetric?: unknown }>
      : []
    old.lifeRunId = typeof old.lifeRunId === 'string' && old.lifeRunId.trim()
      ? old.lifeRunId
      : createNarrativeLifeRunId()
    old.storyRepetitionStats = summarizeNarrativeHistoryRepetition(history)
  }

  delete old.coreMemoryNpcMap
  return old
}

export const useEngineStore = create<EngineStore>()(
  persist(
    (set) => ({
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

      setNarrativeError: (error,) => set({ narrativeError: error, },),

      setPendingNarrative: (pending) => set({ pendingNarrative: { ...pending } }),

      updatePendingNarrative: (executionId, status, statusCode, error) => set((state) => {
        if (state.pendingNarrative?.executionId !== executionId) return {}
        const { error: _previousError, ...pending } = state.pendingNarrative
        return {
          pendingNarrative: {
            ...pending,
            status,
            statusCode,
            ...(error ? { error } : {}),
          },
        }
      }),

      clearPendingNarrative: (executionId) => set((state) => (
        executionId && state.pendingNarrative?.executionId !== executionId
          ? {}
          : { pendingNarrative: null }
      )),

      setLastAutoSaveRound: (round,) => set({ lastAutoSaveRound: round, },),

      setForceBranchNext: (forceBranchNext,) => set({ forceBranchNext, },),

      resolveBranch: (id, choice,) =>
        set((state,) => {
          const resolvedBranches = { ...state.resolvedBranches, [id]: choice }
          const narrativeHistory = state.narrativeHistory.map((chunk) =>
            chunk.id === id
              ? { ...chunk, resolvedChoice: choice, resolvedChoiceRound: state.totalRounds }
              : chunk,
          )
          return { resolvedBranches, narrativeHistory, forceBranchNext: false }
        }),

      setLegendaryEncounterSelection: (lifeRunId, encounter) => set((state) => {
        if (state.lifeRunId !== lifeRunId) return state
        return {
          legendaryEncounterCheckedForLifeRunId: lifeRunId,
          legendaryEncounter: encounter ? { ...encounter, status: 'selected' } : undefined,
        }
      }),

      markLegendaryEncounterInjected: (round) => set((state) => ({
        legendaryEncounter: state.legendaryEncounter
          ? {
              ...state.legendaryEncounter,
              status: 'injected',
              injectedRound: state.legendaryEncounter.injectedRound ?? Math.max(1, Math.trunc(round)),
            }
          : undefined,
      })),

      reset: () =>
        set({
          ...initialState,
          lifeRunId: createNarrativeLifeRunId(),
          round: { ...initialRound, },
        },),
    }),
    {
      name: 'mod-engine:persist:engine-state',
      version: ENGINE_STORE_SCHEMA_VERSION,
      migrate: (persistedState: unknown, version: number) => (
        migrateEnginePersistedState(persistedState, version) as unknown as EngineStore
      ),
      partialize: (state,) => {
        const { setStatus: _a, appendNarrative: _b, setCurrentNarrative: _c, advanceRound: _d, setCompressionStats: _e, setCompressedSummaries: _f, setNarrativeError: _i, pendingNarrative: _pn, setPendingNarrative: _spn, updatePendingNarrative: _upn, clearPendingNarrative: _cpn, setLastAutoSaveRound: _j, setForceBranchNext: _fb, resolveBranch: _rb, setLegendaryEncounterSelection: _les, markLegendaryEncounterInjected: _lei, reset: _o, ...rest } = state
        return rest
      },
    },
  ),
)
