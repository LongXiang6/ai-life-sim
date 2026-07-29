/**
 * @module prompt-flags.ts
 * @description 叙事 Prompt 与时间压缩特性开关
 * @mod core
 */

/** false = 跳过 AI L1-L3 压缩（由 mod-engine orchestrator 读取） */
export const USE_AI_SUMMARY_COMPRESSION = true

/** year×N 达到此 tick 数时注入 bridge summary */
export const BRIDGE_SUMMARY_MIN_TICKS = 10

/** 实验性时间步进 UI（日/月/季步进，默认开启） */
export const EXPERIMENTAL_TIME_STEPS_UI = true

/** JSON 构建时省略空 optional 字段 */
export const OMIT_EMPTY_PROMPT_FIELDS = true
