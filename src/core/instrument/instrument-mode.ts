/**
 * @module instrument-mode.ts
 * @description 插桩模式 — 运行时 MOD 行为监控/性能分析
 * @mod core
 *
 * 吸收 Factorio Instrument Mode 设计：
 *   - --instrument-mod <modname> 命令行参数启用单 MOD 插桩
 *   - 插桩 MOD 的 instrument-data.lua 在最早期加载
 *   - 不修改目标 MOD 代码即可注入监控
 *
 * 本项目实现：
 *   通过 enableInstrumentMode(hooks) 在关键生命周期节点注入回调，
 *   用于开发调试、性能分析、数据快照。
 *
 * 使用方式（开发调试）：
 *   import { enableInstrumentMode } from '@/core'
 *   enableInstrumentMode({
 *     onAfterInit: (name, ms) => console.log(`[perf] ${name} init: ${ms}ms`),
 *   })
 */

/** 插桩回调集合 */
export interface InstrumentHooks {
  /** MOD onInit 前拦截 */
  onBeforeInit?: (modName: string) => void
  /** MOD onInit 后拦截 */
  onAfterInit?: (modName: string, durationMs: number) => void

  /** 子系统 collectState 前拦截 */
  onBeforeCollectState?: (subId: string, round: number) => void
  /** 子系统 collectState 后拦截 */
  onAfterCollectState?: (subId: string, durationMs: number, stateSize: number) => void

  /** AI 调用前拦截 */
  onBeforeAICall?: (promptSize: number) => void
  /** AI 调用后拦截 */
  onAfterAICall?: (durationMs: number, responseSize: number) => void

  /** 事件 emit 拦截 */
  onEventEmit?: (eventName: string, dataSize: number) => void

  /** 回合开始/结束拦截 */
  onRoundStart?: (round: number) => void
  onRoundEnd?: (round: number, durationMs: number) => void

  /** 叙事 Prompt 组装完成（记忆注入可观测） */
  onPromptAssembled?: (report: PromptAssemblyReport) => void
}

/** 叙事 Prompt 组装报告（Instrument Mode 用） */
export interface PromptAssemblyReport {
  round: number
  memorySummaryChars: number
  coreMemoryChars: number
  foreshadowingChars: number
  directionChars: number
  plotStructureChars: number
  estimatedTokens: number
}

/**
 * 全局插桩状态
 */
let instrumentHooks: InstrumentHooks = {}
let instrumentEnabled = false

/**
 * 启用插桩模式
 *
 * 吸收 Factorio Instrument Mode 设计。
 * 传入 hooks 回调 → 引擎在关键生命周期节点调用。
 *
 * @param hooks - 插桩回调集合
 */
export function enableInstrumentMode(hooks: InstrumentHooks): void {
  Object.assign(instrumentHooks, hooks)
  instrumentEnabled = true
}

/** 禁用插桩模式 */
export function disableInstrumentMode(): void {
  instrumentHooks = {}
  instrumentEnabled = false
}

/**
 * 检查插桩是否启用
 * @returns 是否启用插桩模式
 */
export function isInstrumentEnabled(): boolean {
  return instrumentEnabled
}

/**
 * 获取当前插桩 hooks（供引擎内部调用）
 * @returns 插桩回调集合
 */
export function getInstrumentHooks(): InstrumentHooks {
  return instrumentHooks
}
