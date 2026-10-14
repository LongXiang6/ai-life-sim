/**
 * Purpose: Build conditional narrative control-plane fingerprints and call inputs.
 * Owner: mod-engine
 * Responsibility: Derive stable source identity and structured payloads without owning state.
 */

import type {
  CharacterState,
  RoundContext,
  SubSystemState,
  WorldSetting,
} from '@/foundation'

export const NARRATIVE_BIRTH_PROFILE_VERSION = '1.3.0'

export interface NarrativeBirthContext {
  开局属性: Record<'心智' | '体魄' | '魅力' | '财富', string>
  已选天赋: Array<{
    名称: string
    介绍: string
    效果: string
  }>
}

export interface NarrativeControlTriggerInput {
  world: WorldSetting
  character: CharacterState
  context: RoundContext
  subsystemStates: Record<string, SubSystemState>
  lifeRunId: string
  playerIntent?: string
  historyLength: number
  birthContext: NarrativeBirthContext
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
  return fingerprintValue({
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
  })
}

export function birthFingerprint(input: NarrativeControlTriggerInput): string {
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
  roundSequence: number
  world: Record<string, unknown>
  character: Record<string, unknown>
  historyLength: number
  playerIntent?: string
  birthContext: NarrativeBirthContext
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
  return {
    fingerprint: baseFingerprint(input),
    timelineFingerprint: timelineFingerprint(input),
    stageId,
    age: Number.isFinite(ageDays) ? Math.max(0, Math.floor(ageDays / 365)) : 0,
    roundSequence: input.context.roundSequence ?? 0,
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
    birthContext: input.birthContext,
    ...(text(input.playerIntent) ? { playerIntent: text(input.playerIntent) } : {}),
  }
}
