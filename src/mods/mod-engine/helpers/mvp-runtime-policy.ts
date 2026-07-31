/**
 * @module mvp-runtime-policy.ts
 * @description MVP 可玩路径的子系统运行策略
 * @mod mod-engine
 *
 * 阶段 B 口径：延后的模拟系统保持可加载、可恢复，但不进入正常叙事回合。
 * 核心循环只接触角色三件套、世界实体纯数据，以及 mod-engine 自身叙事/记忆系统。
 *
 * 具体白名单已外部化到 mvp-stages-config.default.json，经 mvpStageLoader 按阶段解析；
 * 本模块只导出当前运行链实际消费的集合与判定。
 */

import { mvpStageLoader } from './mvp-stage-loader'

export const MVP_EXTERNAL_RUNTIME_SUBSYSTEM_IDS = mvpStageLoader.getExternalRuntimeSubsystems()

export const MVP_EXTERNAL_RUNTIME_SUBSYSTEM_ORDER = mvpStageLoader.getExternalRuntimeSubsystemOrder()

export const MVP_ENGINE_RUNTIME_SUBSYSTEM_IDS = mvpStageLoader.getEngineRuntimeSubsystems()

export const MVP_ENGINE_RUNTIME_SUBSYSTEM_ORDER = mvpStageLoader.getEngineRuntimeSubsystemOrder()

export const MVP_PROMPT_SUBSYSTEM_IDS = mvpStageLoader.getPromptSubsystems()

export const MVP_SYSTEM_INSTRUCTION_SUBSYSTEM_IDS = mvpStageLoader.getSystemInstructionSubsystems()

export function isMvpRuntimeSubsystem(subsystemId: string): boolean {
  return MVP_EXTERNAL_RUNTIME_SUBSYSTEM_IDS.has(subsystemId)
    || MVP_ENGINE_RUNTIME_SUBSYSTEM_IDS.has(subsystemId)
}

/** 返回当前尚未注册的 MVP 外部运行时子系统，供推进/存读档入口做最终防线。 */
export function getMissingMvpExternalRuntimeSubsystemIds(
  registeredIds: Iterable<string>,
): string[] {
  const registered = new Set(registeredIds)
  return [...MVP_EXTERNAL_RUNTIME_SUBSYSTEM_IDS].filter((id) => !registered.has(id))
}

export interface MvpRuntimeReadiness {
  ready: boolean
  loaderReady: boolean
  missingSubsystems: string[]
}

/** 合并 loader 里程碑与实际绑定，避免 UI、推进、存读档各自维护不同判定。 */
export function resolveMvpRuntimeReadiness(input: {
  allModsLoaded: boolean
  runtimeRegistryFrozen: boolean
  registeredIds: Iterable<string>
}): MvpRuntimeReadiness {
  const loaderReady = input.allModsLoaded || input.runtimeRegistryFrozen
  const missingSubsystems = getMissingMvpExternalRuntimeSubsystemIds(input.registeredIds)
  return {
    ready: loaderReady && missingSubsystems.length === 0,
    loaderReady,
    missingSubsystems,
  }
}

export function isMvpPromptSubsystem(subsystemId: string): boolean {
  return MVP_PROMPT_SUBSYSTEM_IDS.has(subsystemId)
}

export function isMvpSystemInstructionSubsystem(subsystemId: string): boolean {
  return MVP_SYSTEM_INSTRUCTION_SUBSYSTEM_IDS.has(subsystemId)
}

export function shouldApplyMvpCommit(source: string, subsystemId: string): boolean {
  if (source === 'manual') return true
  return isMvpSystemInstructionSubsystem(subsystemId)
}

export function getMvpRuntimeSubsystemOrder(subsystemId: string): number {
  const externalIndex = MVP_EXTERNAL_RUNTIME_SUBSYSTEM_ORDER.indexOf(subsystemId)
  if (externalIndex >= 0) return externalIndex
  const engineIndex = MVP_ENGINE_RUNTIME_SUBSYSTEM_ORDER.indexOf(subsystemId)
  if (engineIndex >= 0) return MVP_EXTERNAL_RUNTIME_SUBSYSTEM_ORDER.length + engineIndex
  throw new Error(`[MvpStageConfig] 未声明活动子系统顺序: ${subsystemId}`)
}
