/**
 * Purpose: Build conditional narrative control-plane fingerprints and call inputs.
 * Owner: mod-engine
 * Responsibility: Derive stable source identity and structured payloads without owning state.
 */

import {
  normalizeCanonicalTimeStep,
  type CharacterState,
  type NarrativeLifePlan,
  type RoundContext,
  type SubSystemState,
  type WorldSetting,
} from '@/foundation'

export const NARRATIVE_BIRTH_PROFILE_VERSION = '1.8.0'
export const NARRATIVE_PLAN_VERSION = '1.1.0'
export const NARRATIVE_EVENT_POOL_VERSION = '3.0.0'

export interface NarrativeBirthAttribute {
  点数: number
  语义: string
}

export interface NarrativeBirthContext {
  属性尺度: {
    凡人最差: -10
    凡人基准: 0
    凡人正面上限: 10
    超凡: '小于-10或大于10'
  }
  开局属性: Record<'心智' | '体魄' | '魅力' | '财富', NarrativeBirthAttribute>
  已选天赋: Array<{
    名称: string
    介绍: string
    效果: string
    资质阶位: string
    开发阶段: string
    至高强化阶数?: number
  }>
}

export interface NarrativeCharacterContext {
  属性尺度: NarrativeBirthContext['属性尺度']
  当前属性: Record<'心智' | '体魄' | '魅力' | '财富', NarrativeBirthAttribute>
  已选天赋: NarrativeBirthContext['已选天赋']
}

export interface NarrativeControlTriggerInput {
  world: WorldSetting
  character: CharacterState
  context: RoundContext
  subsystemStates: Record<string, SubSystemState>
  lifeRunId: string
  playerIntent?: string
  historyLength: number
  narrativeWindow?: string
  birthContext: NarrativeBirthContext
  characterContext: NarrativeCharacterContext
  /** 有待消费的批量故事时抑制补池，避免排队轮的卡名在新池里映射不到 id。 */
  suppressEventRefill?: boolean
}

/** 事件生成只消费与时间尺度相关的计划投影，避免把完整控制平面塞进候选卡。 */
export function projectLifePlanForControlPlane(
  lifePlan: NarrativeLifePlan | undefined,
): Record<string, unknown> | undefined {
  if (!lifePlan) return undefined
  return {
    阶段标识: lifePlan.阶段标识,
    当前阶段: lifePlan.当前阶段,
    阶段目标: lifePlan.阶段目标,
    ...(lifePlan.下一阶段入口.length > 0
      ? { 下一阶段入口: lifePlan.下一阶段入口 }
      : {}),
  }
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function fingerprintValue(value: unknown): string {
  const source = JSON.stringify(value)
  let hash = 2166136261
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `fp:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export function currentStageId(input: NarrativeControlTriggerInput): string {
  const data = input.subsystemStates['character-base']?.data
  if (!data || typeof data !== 'object' || Array.isArray(data)) return 'unknown'
  const status = (data as Record<string, unknown>).status
  if (!status || typeof status !== 'object' || Array.isArray(status)) return 'unknown'
  return text((status as Record<string, unknown>).currentStageId) || 'unknown'
}

export function baseFingerprint(input: NarrativeControlTriggerInput): string {
  const timeStep = normalizeCanonicalTimeStep(input.context.timeStep ?? { unit: 'year', value: 1 })
  return fingerprintValue({
    eventPoolVersion: NARRATIVE_EVENT_POOL_VERSION,
    planVersion: NARRATIVE_PLAN_VERSION,
    timeScale: `${timeStep.unit}:${timeStep.value}`,
    world: {
      contextId: input.world.contextId,
      contextKind: input.world.contextKind,
      name: input.world.name,
      description: input.world.description,
    },
    character: {
      characterId: input.character.characterId,
      background: input.character.background,
      gender: input.character.gender,
    },
    stage: currentStageId(input),
    playerIntent: text(input.playerIntent),
    // 属性只在生成时作为上下文，不进入指纹：属性每轮小幅漂移不应让整池卡失效，
    // 也不应触发 commitPlan 清池（否则批次内会整段无卡）。阶段与玩家意图才是重建依据。
  })
}

export function birthFingerprint(input: NarrativeControlTriggerInput): string {
  const baseData = input.subsystemStates['character-base']?.data
  const startingAge = baseData && typeof baseData === 'object' && !Array.isArray(baseData)
    ? Number((baseData as Record<string, unknown>).startingAge)
    : input.character.age
  return fingerprintValue({
    profileVersion: NARRATIVE_BIRTH_PROFILE_VERSION,
    world: {
      contextId: input.world.contextId,
      contextKind: input.world.contextKind,
      name: input.world.name,
      description: input.world.description,
    },
    character: {
      characterId: input.character.characterId,
      background: input.character.background,
      gender: input.character.gender,
    },
    startingAge: Number.isFinite(startingAge) ? Math.max(0, Math.floor(startingAge)) : 0,
    birthContext: input.birthContext,
  })
}

export function timelineFingerprint(input: NarrativeControlTriggerInput): string {
  return fingerprintValue({
    contextId: input.world.contextId,
    contextKind: input.world.contextKind,
    name: input.world.name,
    description: input.world.description,
  })
}

export interface NarrativeControlInputPayload {
  fingerprint: string
  timelineFingerprint: string
  stageId: string
  age: number
  startingAge: number
  roundSequence: number
  world: Record<string, unknown>
  character: Record<string, unknown>
  historyLength: number
  narrativeWindow?: string
  playerIntent?: string
  birthContext: NarrativeBirthContext
  characterContext: NarrativeCharacterContext
}

export function buildNarrativeControlInput(
  input: NarrativeControlTriggerInput,
): NarrativeControlInputPayload {
  const stageId = currentStageId(input)
  const statusData = input.subsystemStates['character-base']?.data
  const status = statusData && typeof statusData === 'object' && !Array.isArray(statusData)
    ? (statusData as Record<string, unknown>).status
    : undefined
  const ageDays = status && typeof status === 'object' && !Array.isArray(status)
    ? Number((status as Record<string, unknown>).ageDays)
    : 0
  const rawStartingAge = statusData && typeof statusData === 'object' && !Array.isArray(statusData)
    ? Number((statusData as Record<string, unknown>).startingAge)
    : input.character.age
  const fingerprint = baseFingerprint(input)
  const roundSequence = input.context.roundSequence ?? 0
  return {
    fingerprint,
    timelineFingerprint: timelineFingerprint(input),
    stageId,
    age: Number.isFinite(ageDays) ? Math.max(0, Math.floor(ageDays / 365)) : 0,
    startingAge: Number.isFinite(rawStartingAge) ? Math.max(0, Math.floor(rawStartingAge)) : 0,
    roundSequence,
    world: {
      contextId: input.world.contextId,
      contextKind: input.world.contextKind,
      name: input.world.name,
      description: input.world.description,
      era: input.world.era,
    },
    character: {
      characterId: input.character.characterId,
      name: input.character.name,
      gender: input.character.gender,
      background: input.character.background,
    },
    historyLength: input.historyLength,
    ...(text(input.narrativeWindow) ? { narrativeWindow: text(input.narrativeWindow) } : {}),
    birthContext: input.birthContext,
    characterContext: input.characterContext,
    ...(text(input.playerIntent) ? { playerIntent: text(input.playerIntent) } : {}),
  }
}
