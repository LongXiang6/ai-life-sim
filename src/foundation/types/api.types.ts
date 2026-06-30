/**
 * @module api.types.ts
 * @description API 通用类型 —— AI 模型配置、叙事响应
 * @mod foundation
 *
 * 规范来源：mod-specification.md §8 AI Prompt 规范
 */

import type { SubSystemChanges } from './subsystem.types'

/** JSON Mode 配置 */
export interface ResponseFormat {
  type: 'json_object' | 'text',
}

/** AI 模型配置 */
export interface AIModelConfig {
  /** 模型标识 */
  model: string,
  /** 温度 */
  temperature: number,
  /** 最大 token */
  maxTokens: number,
  /** 是否流式输出 */
  stream: boolean,
  /** JSON Mode 输出格式（response_format） */
  responseFormat?: ResponseFormat,
  /** 推理强度（7 级：disabled + level-1~6） */
  reasoningEffort?: 'disabled' | 'level-1' | 'level-2' | 'level-3' | 'level-4' | 'level-5' | 'level-6',
}

/** AI 叙事响应 */
export interface NarrativeResponse {
  /** 叙事文本 */
  narrative: string
  /** 子系统变更列表 */
  changes: SubSystemChanges[]
  /** 重要事件标记 */
  notableEvents?: string[]
}
