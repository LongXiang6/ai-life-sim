/**
 * @module world-init-budgets.ts
 * @description 世界初始化 Pipeline Token 预算 —— prompt 感知 + 描述长度动态缩放，无输出封顶
 *
 * 主路径 AI 步：dimensionCalibration（维度+校准合并，勿拆步）。
 * calibration / tags 预算仅用于 Pipeline fallback（缓存缺 W02 / 缺 worldTags）。
 * @mod mod-world
 */

import {
  scaleTokenBudgetByInputLength,
  bumpTokenBudget,
} from '@/foundation'
import { clamp } from '@/core/shared'

import {
  worldCalibrationPrompt,
  worldDimensionCalibrationPrompt,
  worldTagsPrompt,
  worldEntityPrompt,
} from '../prompts'

export interface WorldInitPipelineBudgets {
  /** 主路径：dimension-calibration 合并步 */
  dimensionCalibration: number
  /** fallback：缓存命中但缺 W02 时单独校准 */
  calibration: number
  /** fallback：合并步未返回 worldTags 时补生成 */
  tags: number
  /** 与 calibration 相同（兼容旧引用） */
  config: number
  entities: number
}

/** 单步预算：system + user 模板 + worldDescription 填充后的 echo 风险 */
function budgetForStep(
  systemPrompt: string,
  userTemplate: string,
  outputEstimate: number,
  descriptionLength: number,
  minTokens: number,
): number {
  const inputChars = systemPrompt.length + userTemplate.length + clamp(descriptionLength, 0, Infinity)
  return scaleTokenBudgetByInputLength(outputEstimate, inputChars, minTokens)
}

/**
 * 根据 worldDescription 长度构建各步骤 maxTokens 预算（无硬顶）
 */
export function buildWorldInitPipelineBudgets(descriptionLength: number): WorldInitPipelineBudgets {
  const len = clamp(descriptionLength, 0, Infinity)

  const calibration = budgetForStep(
    worldCalibrationPrompt.systemPrompt,
    worldCalibrationPrompt.userPromptTemplate,
    4400,
    len,
    3072,
  )

  const dimensionCalibration = budgetForStep(
    worldDimensionCalibrationPrompt.systemPrompt,
    worldDimensionCalibrationPrompt.userPromptTemplate,
    4800,
    len,
    3584,
  )

  return {
    dimensionCalibration,
    calibration,
    tags: budgetForStep(
      worldTagsPrompt.systemPrompt,
      worldTagsPrompt.userPromptTemplate,
      400,
      len,
      768,
    ),
    config: calibration,
    entities: budgetForStep(
      worldEntityPrompt.systemPrompt,
      worldEntityPrompt.userPromptTemplate,
      7500,
      len,
      8192,
    ),
  }
}

/** 截断重试时将预算 ×2（256 对齐，不封顶） */
export function bumpTokenBudgetForRetry(current: number): number {
  return bumpTokenBudget(current, 2)
}

/** Pipeline 主路径 + fallback 引用的 Prompt（供 bundle 静态默认值） */
export const WORLD_INIT_PROMPT_REFS = {
  worldDimensionCalibrationPrompt,
  worldCalibrationPrompt,
  worldTagsPrompt,
  worldEntityPrompt,
} as const
