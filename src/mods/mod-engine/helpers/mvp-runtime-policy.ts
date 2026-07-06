/**
 * @module mvp-runtime-policy.ts
 * @description MVP 可玩路径的子系统运行策略
 * @mod mod-engine
 *
 * 阶段 B 口径：延后的模拟系统保持可加载、可恢复，但不进入正常叙事回合。
 * 核心循环只接触角色三件套、世界实体纯数据，以及 mod-engine 自身叙事/记忆系统。
 *
 * 具体白名单已外部化到 mvp-stages-config.default.json，经 mvpStageLoader 按阶段解析；
 * 本模块保留原有导出契约，内部委托给配置加载器。
 */

import { mvpStageLoader } from './mvp-stage-loader'

export const MVP_EXTERNAL_RUNTIME_SUBSYSTEM_IDS = mvpStageLoader.getExternalRuntimeSubsystems()

export const MVP_ENGINE_RUNTIME_SUBSYSTEM_IDS = mvpStageLoader.getEngineRuntimeSubsystems()

export const MVP_PROMPT_SUBSYSTEM_IDS = mvpStageLoader.getPromptSubsystems()

export const MVP_NARRATIVE_CHANGE_SUBSYSTEM_IDS = mvpStageLoader.getNarrativeChangeSubsystems()

export const MVP_ALLOWED_SUBSYSTEMS_TEXT = mvpStageLoader.getAllowedSubsystemsText()

export const MVP_SUBSYSTEM_GUIDE = mvpStageLoader.getSubsystemGuide()

export function isMvpRuntimeSubsystem(subsystemId: string): boolean {
  return MVP_EXTERNAL_RUNTIME_SUBSYSTEM_IDS.has(subsystemId)
    || MVP_ENGINE_RUNTIME_SUBSYSTEM_IDS.has(subsystemId)
}

export function isMvpPromptSubsystem(subsystemId: string): boolean {
  return MVP_PROMPT_SUBSYSTEM_IDS.has(subsystemId)
}

export function isMvpNarrativeChangeSubsystem(subsystemId: string): boolean {
  return MVP_NARRATIVE_CHANGE_SUBSYSTEM_IDS.has(subsystemId)
}

export function shouldApplyMvpCommit(source: string, subsystemId: string): boolean {
  if (source === 'manual') return true
  return isMvpNarrativeChangeSubsystem(subsystemId)
}
