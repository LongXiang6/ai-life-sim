/**
 * @module narrative-macro-impact-systems.ts
 * @description 宏观影响 AI 可读取和可提交的主要模拟系统唯一清单
 * @mod mod-engine
 */

export const NARRATIVE_MACRO_CONTEXT_SUBSYSTEM_IDS = [
  'spatial-graph',
  'culture-tech',
] as const

export type NarrativeMacroSubsystemId = typeof NARRATIVE_MACRO_CONTEXT_SUBSYSTEM_IDS[number]
