/**
 * @module index.ts
 * @description 日志工具统一导出
 * @mod core
 */

export { logger } from './client-logger'
export { logAICall, logAICallFireAndForget, buildNarrativeLog } from './debug-logger'
export type { DebugLogCategory, DebugLogEntry } from './debug-logger'
export { recordAICallLog, formatMessagesForLog } from './ai-call-log'
export type { AICallLogContext, AICallUsageSnapshot, RecordAICallLogParams } from './ai-call-log'
