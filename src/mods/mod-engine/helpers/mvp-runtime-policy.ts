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
import {
  buildSubsystemGuide,
  getNarrativeAISubsystemContracts,
} from './subsystem-field-registry'

export const MVP_EXTERNAL_RUNTIME_SUBSYSTEM_IDS = mvpStageLoader.getExternalRuntimeSubsystems()

export const MVP_ENGINE_RUNTIME_SUBSYSTEM_IDS = mvpStageLoader.getEngineRuntimeSubsystems()

export const MVP_PROMPT_SUBSYSTEM_IDS = mvpStageLoader.getPromptSubsystems()

export const MVP_NARRATIVE_CHANGE_SUBSYSTEM_IDS = mvpStageLoader.getNarrativeChangeSubsystems()

export const MVP_ALLOWED_SUBSYSTEMS_TEXT = mvpStageLoader.getAllowedSubsystemsText()

export const MVP_SUBSYSTEM_GUIDE = mvpStageLoader.getSubsystemGuide()

/**
 * 仅为本轮实际开放、且属于当前阶段 narrativeChange 白名单的子系统生成指南。
 * 顺序跟随阶段配置，避免注册顺序变化破坏稳定 Prompt 前缀。
 */
export function buildMvpSubsystemGuide(activeSubsystemIds: Iterable<string>): string {
  const activeIds = new Set(activeSubsystemIds)
  const writableIds = [...MVP_NARRATIVE_CHANGE_SUBSYSTEM_IDS]
    .filter((id) => activeIds.has(id))

  if (writableIds.length === 0) return ''

  const writableNames = getNarrativeAISubsystemContracts(writableIds)
    .map((contract) => contract.aiName)

  return [
    `本轮可变更系统仅限：${writableNames.join('、')}`,
    buildSubsystemGuide(writableIds),
    '“状态变更”必须是数组；每项固定为 {"系统":"上列系统名","说明":"本轮成立的变化","变更":{"上列字段名":数值}}，禁止把“变更”对象直接放在“状态变更”下。',
    '提交规则：只有剧情明确造成上述数值变化时才写入“状态变更”；否则省略整个字段。',
    '只使用上列中文系统名与中文字段名；当前年龄由时间系统派生，禁止提交年龄；未列系统不得写入。',
  ].join('\n')
}

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

export function isMvpNarrativeChangeSubsystem(subsystemId: string): boolean {
  return MVP_NARRATIVE_CHANGE_SUBSYSTEM_IDS.has(subsystemId)
}

export function shouldApplyMvpCommit(source: string, subsystemId: string): boolean {
  if (source === 'manual') return true
  return isMvpNarrativeChangeSubsystem(subsystemId)
}
