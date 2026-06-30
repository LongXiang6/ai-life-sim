/**
 * @module campaigns/default/index.ts
 * @description 默认角色叙事 Campaign — 角色出身/背景叙事配置
 * @mod mod-character
 *
 * 吸收 Factorio campaigns/ 设计。
 *
 * 当前为空占位，未来可扩展角色创建叙事管线：
 *   - race-origin:     种族出身叙事
 *   - childhood-event: 童年关键事件
 *   - initial-talent:  初始天赋觉醒
 */

import type { NarrativeStage, AIModelConfig, PromptTemplate } from '@/foundation'

/** 角色叙事阶段（当前为空，未来扩展） */
export const stages: NarrativeStage[] = []

/**
 * 加载角色叙事阶段
 *
 * 签名与 mod-engine campaign 的 loadStages 保持一致，
 * 但 mod-character 当前无实际阶段逻辑。
 * @param _aiConfig AI 模型配置
 * @param _promptTemplate Prompt 模板
 * @param _sessionId 会话 ID（可选）
 * @returns 叙事阶段列表
 */
export function loadStages(
  _aiConfig: AIModelConfig,
  _promptTemplate: PromptTemplate,
  _sessionId?: string,
): NarrativeStage[] {
  return stages
}
