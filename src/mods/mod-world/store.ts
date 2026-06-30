/**
 * @module store.ts
 * @description 世界 Zustand Store —— 全局暴露世界配置、具名实体、时间线
 * @mod mod-world
 */

'use client'

import { create, } from 'zustand'
import { persist, } from 'zustand/middleware'

import type {
  WorldConfig,
  AnyWorldEntity,
  WorldCalibration,
  FormulaModifierKey,
} from './types'

/** AI 世界初始化状态 */
export interface WorldInitAIStatus {
  status: 'idle' | 'running' | 'complete' | 'failed'
  /** 当前执行步骤（便于 UI 展示） */
  currentStep?: string
  calibrationGenerated: boolean
  tagsGenerated: boolean
  configGenerated: boolean
  timelineGenerated: boolean
  entitiesGenerated: boolean
  retryCount: number
  maxRetries: number
  errors: string[]
}

/** 生成世界唯一编码（时间戳 + 随机数） */
function generateWorldCode(): number {
  const ts = Date.now() % 10_000_000_000
  const rand = Math.floor(Math.random() * 10_000,)
  return ts * 10_000 + rand
}

interface WorldStore {
  /** 当前世界配置 */
  worldConfig: WorldConfig | null
  /** 具名实体列表 */
  entities: AnyWorldEntity[]
  /** 世界是否已初始化 */
  initialized: boolean
  /** 当前世界编码 */
  worldCode: number
  /** 当前世纪年份（从引擎轮数转换） */
  currentYear: number
  /** 世界标签（AI 生成） */
  worldTags: string[]
  /** 时间线起始年份（来自世界预设 eraStartYear） */
  eraStartYear: number
  /** 纪元名称（来自世界预设 eraName，空字符串时由引擎自动生成） */
  eraName: string

  /** AI 世界校准（Step 0） */
  calibration: WorldCalibration | null

  /** 命格选取后叠加的运行时公式 modifier（乘法） */
  destinyPatternModifiers: Partial<Record<FormulaModifierKey, number>>

  /** AI 初始化状态（静默生成 → fate-preview 门控） */
  worldInitAIStatus: WorldInitAIStatus | null

  setWorldConfig: (config: WorldConfig) => void
  setEntities: (entities: AnyWorldEntity[]) => void
  setInitialized: (value: boolean) => void
  setWorldCode: (code: number) => void
  setCurrentYear: (year: number) => void
  setWorldTags: (tags: string[]) => void
  setEraStartYear: (year: number) => void
  setEraName: (name: string) => void
  setCalibration: (calibration: WorldCalibration | null) => void
  setDestinyPatternModifiers: (modifiers: Partial<Record<FormulaModifierKey, number>>) => void
  setWorldInitAIStatus: (status: WorldInitAIStatus | null) => void
  /** 生成并设置新的世界编码 */
  generateAndSetWorldCode: () => number
  /** 回收当前世界编码（清除 store 中的编码） */
  recycleWorldCode: () => void
  reset: () => void,
}

const initialState = {
  worldConfig: null as WorldConfig | null,
  entities: [] as AnyWorldEntity[],
  initialized: false,
  worldCode: 0,
  currentYear: 0,
  worldTags: [] as string[],
  eraStartYear: 0,
  eraName: '',
  calibration: null as WorldCalibration | null,
  destinyPatternModifiers: {} as Partial<Record<FormulaModifierKey, number>>,
  worldInitAIStatus: null as WorldInitAIStatus | null,
}

export const useWorldStore = create<WorldStore>()(
  persist(
    (set,) => ({
      ...initialState,

      setWorldConfig: (config,) =>
        set((s,) => ({
          worldConfig: config,
          worldCode: s.worldCode === 0 ? generateWorldCode() : s.worldCode,
        }),),
      setEntities: (entities,) => set({ entities, },),
      setInitialized: (value,) => set({ initialized: value, },),
      setWorldCode: (code,) => set({ worldCode: code, },),
      setCurrentYear: (year,) => set({ currentYear: year, },),
      setWorldTags: (tags,) => set({ worldTags: tags, },),
      setEraStartYear: (year,) => set({ eraStartYear: year, },),
      setEraName: (eraName,) => set({ eraName, },),
      setCalibration: (calibration,) => set({ calibration, },),
      setDestinyPatternModifiers: (destinyPatternModifiers,) => set({ destinyPatternModifiers, },),
      setWorldInitAIStatus: (status) => set({ worldInitAIStatus: status, },),
      generateAndSetWorldCode: () => {
        const code = generateWorldCode()
        set({ worldCode: code, },)
        return code
      },
      recycleWorldCode: () => set({ worldCode: 0, },),
      reset: () => set({ ...initialState, },),
    }),
    {
      name: 'mod-world:persist:world-state',
      version: 3,
      migrate: (persistedState: unknown, version: number) => {
        const state = persistedState as Record<string, unknown>
        if (version < 2 && state.calibration === undefined) {
          state.calibration = null
        }
        if (version < 3 && state.destinyPatternModifiers === undefined) {
          state.destinyPatternModifiers = {}
        }
        return state as unknown as WorldStore
      },
      partialize: (state,) => {
        const {
          setWorldConfig: _a, setEntities: _b, setInitialized: _c, setWorldCode: _d,
          setCurrentYear: _e, setWorldTags: _f, setEraStartYear: _g, setEraName: _g2, setCalibration: _h2,
          setWorldInitAIStatus: _h, generateAndSetWorldCode: _i, recycleWorldCode: _j, reset: _k,
          ...rest
        } = state
        return rest
      },
    },
  ),
)
