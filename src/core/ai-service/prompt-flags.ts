/**
 * @module prompt-flags.ts
 * @description 叙事 Prompt / KV 特性开关（Phase 6 + Phase 7）
 * @mod core
 */

/** true = 回退旧双 user 残缺分段（仅 debug） */
export const USE_LEGACY_SEGMENTED_PROMPT = false

/** false = 跳过 AI L1–L6 压缩（由 mod-engine orchestrator 读取） */
export const USE_AI_SUMMARY_COMPRESSION = true

/** 消息策略：S1 单 user | S2 双 user | S3 多轮 assistant */
export type KVMessageStrategy = 'S1' | 'S2' | 'S3'

/** @deprecated 使用 KV_MESSAGE_STRATEGY；true 等价于 S2 */
export const KV_TWO_USER_SEGMENTS = false

/** 叙事 API messages 策略（S2：stable + variable 双 user，利于 KV 前缀落盘） */
export const KV_MESSAGE_STRATEGY: KVMessageStrategy = 'S2'

/** S3 滑动窗口保留对话对数 */
export const KV_CONVERSATION_WINDOW = 6

/** year×N 达到此 tick 数时注入 bridge summary */
export const BRIDGE_SUMMARY_MIN_TICKS = 10

/** 实验性时间步进 UI（日/月/季步进，默认开启） */
export const EXPERIMENTAL_TIME_STEPS_UI = true

/** JSON 构建时省略空 optional 字段 */
export const OMIT_EMPTY_PROMPT_FIELDS = true

/** memorySummary 含 L0 时 narrativeHistory 缩为 2 条 + hash 去重 */
export const DEDUP_NARRATIVE_HISTORY = true
