/**
 * @module mvp-runtime-policy.ts
 * @description MVP 可玩路径的子系统运行策略
 * @mod mod-engine
 *
 * 阶段 B 口径：延后的模拟系统保持可加载、可恢复，但不进入正常叙事回合。
 * 核心循环只接触角色三件套、世界实体纯数据，以及 mod-engine 自身叙事/记忆系统。
 */

export const MVP_EXTERNAL_RUNTIME_SUBSYSTEM_IDS = new Set([
  'character-base',
  'destiny-pattern',
  'lifespan',
  'world-entity',
] as const)

export const MVP_ENGINE_RUNTIME_SUBSYSTEM_IDS = new Set([
  'time',
  'orchestrator',
  'narrative-parser',
  'summary-compressor',
  'memory-engine',
  'subsystem-relevance',
  'memory-lifecycle',
  'memory-forgetting',
  'causal-delay',
  'plot-structure',
  'foreshadowing',
  'core-memory',
] as const)

export const MVP_PROMPT_SUBSYSTEM_IDS = new Set([
  ...MVP_EXTERNAL_RUNTIME_SUBSYSTEM_IDS,
  ...MVP_ENGINE_RUNTIME_SUBSYSTEM_IDS,
] as const)

export const MVP_NARRATIVE_CHANGE_SUBSYSTEM_IDS = new Set([
  'character-base',
  'lifespan',
] as const)

export const MVP_ALLOWED_SUBSYSTEMS_TEXT =
  '可变更子系统仅下列ID，禁止自编：character-base lifespan'

export const MVP_SUBSYSTEM_GUIDE = `character-base:
  physique(0~100) mind(0~100) comprehension(0~100) charisma(0~100) background(0~100)
lifespan:
  age(N) maxAge(N) lifespanDelta(±)
---
MVP 提交规则：
  仅当叙事确实改变基础属性或寿命时写 changes；普通剧情发展请返回空数组 []。
  健康、经济、声望、关系、修炼、战力、技能、家庭、信仰、气运等模拟系统当前延后，禁止写入。`

export function isMvpRuntimeSubsystem(subsystemId: string): boolean {
  return MVP_EXTERNAL_RUNTIME_SUBSYSTEM_IDS.has(subsystemId as never)
    || MVP_ENGINE_RUNTIME_SUBSYSTEM_IDS.has(subsystemId as never)
}

export function isMvpPromptSubsystem(subsystemId: string): boolean {
  return MVP_PROMPT_SUBSYSTEM_IDS.has(subsystemId as never)
}

export function isMvpNarrativeChangeSubsystem(subsystemId: string): boolean {
  return MVP_NARRATIVE_CHANGE_SUBSYSTEM_IDS.has(subsystemId as never)
}

export function shouldApplyMvpCommit(source: string, subsystemId: string): boolean {
  if (source === 'manual') return true
  return isMvpNarrativeChangeSubsystem(subsystemId)
}
