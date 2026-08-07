/**
 * Purpose: Validate the current persisted character narrative-status shape.
 * Owner: mod-character / character-base
 * Responsibility: Reject malformed current snapshots without translating retired subsystem schemas.
 */

import type {
  CharacterConditionState,
  CharacterDeathCauseKind,
  CharacterDeathOutcome,
  CharacterFortuneLevel,
  CharacterLifeStageDefinition,
  CharacterMoralityLevel,
  CharacterNarrativeStatus,
} from '@/foundation'

const CLOCK_MODES = new Set(['aging', 'ageless', 'cyclic', 'external'])
const DEATH_CAUSES = new Set<CharacterDeathCauseKind>(['story', 'condition', 'trauma', 'life-ending'])
const FORTUNE_LEVELS = new Set<CharacterFortuneLevel>([
  'very-unlucky', 'unlucky', 'ordinary', 'lucky', 'very-lucky',
])
const MORALITY_LEVELS = new Set<CharacterMoralityLevel>([
  'supremeGood', 'greatGood', 'good', 'balanced', 'evilLeaning', 'greatEvil', 'supremeEvil',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function integer(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : undefined
}

function nonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function stringList(value: unknown): string[] | undefined {
  if (!Array.isArray(value) || value.some((item) => !nonEmptyString(item))) return undefined
  return value.map((item) => (item as string).trim())
}

function sanitizeLifeStage(value: unknown): CharacterLifeStageDefinition | undefined {
  if (!isRecord(value)) return undefined
  const stageId = nonEmptyString(value.stageId)
  const displayName = nonEmptyString(value.displayName)
  const description = nonEmptyString(value.description)
  const guidance = nonEmptyString(value.guidance)
  const minAgeDays = integer(value.minAgeDays, 0, Number.MAX_SAFE_INTEGER)
  const maxAgeDays = value.maxAgeDays === undefined
    ? undefined
    : integer(value.maxAgeDays, 1, Number.MAX_SAFE_INTEGER)
  if (!stageId || !displayName || !description || !guidance || minAgeDays === undefined) return undefined
  if (maxAgeDays !== undefined && maxAgeDays <= minAgeDays) return undefined
  return { stageId, displayName, description, minAgeDays, ...(maxAgeDays === undefined ? {} : { maxAgeDays }), guidance }
}

function sanitizeCondition(value: unknown): CharacterConditionState | undefined {
  if (!isRecord(value)) return undefined
  const conditionId = nonEmptyString(value.conditionId)
  const contextId = nonEmptyString(value.contextId)
  const name = nonEmptyString(value.name)
  const summary = nonEmptyString(value.summary)
  const severity = integer(value.severity, 1, 10)
  const onsetTotalDays = integer(value.onsetTotalDays, 0, Number.MAX_SAFE_INTEGER)
  const evidenceEventIds = stringList(value.evidenceEventIds)
  if (
    !conditionId || !contextId || !name || !summary || severity === undefined
    || onsetTotalDays === undefined || !evidenceEventIds
    || !['active', 'recovering', 'resolved'].includes(String(value.status))
  ) return undefined
  return {
    conditionId,
    contextId,
    name,
    severity,
    summary,
    status: value.status as CharacterConditionState['status'],
    onsetTotalDays,
    evidenceEventIds,
  }
}

function sanitizeDeath(value: unknown): CharacterDeathOutcome | undefined {
  if (!isRecord(value)) return undefined
  const deathId = nonEmptyString(value.deathId)
  const entityId = nonEmptyString(value.entityId)
  const contextId = nonEmptyString(value.contextId)
  const causeLabel = nonEmptyString(value.causeLabel)
  const historicalEventId = nonEmptyString(value.historicalEventId)
  const occurredAtTotalDays = integer(value.occurredAtTotalDays, 0, Number.MAX_SAFE_INTEGER)
  const finalAgeDays = integer(value.finalAgeDays, 0, Number.MAX_SAFE_INTEGER)
  const epilogueText = value.epilogueText === undefined ? undefined : nonEmptyString(value.epilogueText)
  if (
    !deathId || !entityId || !contextId || !causeLabel || !historicalEventId
    || occurredAtTotalDays === undefined || finalAgeDays === undefined
    || !DEATH_CAUSES.has(value.causeKind as CharacterDeathCauseKind)
    || !['pending', 'ready'].includes(String(value.epilogueStatus))
  ) return undefined
  if ((value.epilogueStatus === 'ready') !== Boolean(epilogueText)) return undefined
  return {
    deathId,
    entityId,
    contextId,
    causeKind: value.causeKind as CharacterDeathCauseKind,
    causeLabel,
    occurredAtTotalDays,
    finalAgeDays,
    historicalEventId,
    epilogueStatus: value.epilogueStatus as CharacterDeathOutcome['epilogueStatus'],
    ...(epilogueText ? { epilogueText } : {}),
  }
}

export function sanitizeCharacterNarrativeStatus(value: unknown): CharacterNarrativeStatus | undefined {
  if (!isRecord(value)) return undefined
  const entityId = value.entityId === undefined ? undefined : nonEmptyString(value.entityId)
  const raceId = nonEmptyString(value.raceId)
  const raceName = nonEmptyString(value.raceName)
  const ageAnchorTotalDays = integer(value.ageAnchorTotalDays, 0, Number.MAX_SAFE_INTEGER)
  const ageDays = integer(value.ageDays, 0, Number.MAX_SAFE_INTEGER)
  const maximumLifespanDays = integer(value.maximumLifespanDays, 1, Number.MAX_SAFE_INTEGER)
  const endRisk = integer(value.endRisk, 0, 100)
  const lastAnalyzedAtTotalDays = integer(value.lastAnalyzedAtTotalDays, 0, Number.MAX_SAFE_INTEGER)
  const lifeStages = Array.isArray(value.lifeStages) ? value.lifeStages.map(sanitizeLifeStage) : []
  const guidance = stringList(value.guidance)
  if (
    (value.entityId !== undefined && !entityId) || !raceId || !raceName
    || !CLOCK_MODES.has(String(value.clockMode)) || ageAnchorTotalDays === undefined
    || ageDays === undefined || maximumLifespanDays === undefined || endRisk === undefined
    || lastAnalyzedAtTotalDays === undefined || lifeStages.length === 0
    || lifeStages.some((stage) => !stage) || !guidance || !isRecord(value.health)
    || !isRecord(value.fortune) || !isRecord(value.morality)
  ) return undefined

  const conditions = Array.isArray(value.health.conditions)
    ? value.health.conditions.map(sanitizeCondition)
    : []
  const vitality = integer(value.health.vitality, 0, Number.MAX_SAFE_INTEGER)
  const maxVitality = integer(value.health.maxVitality, 1, Number.MAX_SAFE_INTEGER)
  const stamina = integer(value.health.stamina, 0, 100)
  const spirit = integer(value.health.spirit, 0, 100)
  const updatedAtTotalDays = integer(value.health.updatedAtTotalDays, 0, Number.MAX_SAFE_INTEGER)
  const death = value.health.death === undefined ? undefined : sanitizeDeath(value.health.death)
  if (
    typeof value.health.alive !== 'boolean' || vitality === undefined || maxVitality === undefined
    || vitality > maxVitality || stamina === undefined || spirit === undefined
    || updatedAtTotalDays === undefined || conditions.some((condition) => !condition)
    || (value.health.death !== undefined && !death) || value.health.alive === Boolean(death)
  ) return undefined

  const fortuneValue = integer(value.fortune.value, -100, 100)
  const fortuneGuidance = nonEmptyString(value.fortune.guidance)
  const moralityValue = integer(value.morality.value, -100, 100)
  const moralityRoundDelta = integer(value.morality.roundDelta, -100, 100)
  const moralityGuidance = nonEmptyString(value.morality.guidance)
  if (
    fortuneValue === undefined || !FORTUNE_LEVELS.has(value.fortune.level as CharacterFortuneLevel)
    || !fortuneGuidance || moralityValue === undefined || moralityRoundDelta === undefined
    || !MORALITY_LEVELS.has(value.morality.level as CharacterMoralityLevel) || !moralityGuidance
  ) return undefined

  return {
    ...(entityId ? { entityId } : {}),
    raceId,
    raceName,
    clockMode: value.clockMode as CharacterNarrativeStatus['clockMode'],
    ageAnchorTotalDays,
    ageDays,
    maximumLifespanDays,
    lifeStages: lifeStages as CharacterLifeStageDefinition[],
    ...(typeof value.currentStageId === 'string' && value.currentStageId.trim()
      ? { currentStageId: value.currentStageId.trim() }
      : {}),
    endRisk,
    health: {
      vitality,
      maxVitality,
      stamina,
      spirit,
      alive: value.health.alive,
      conditions: conditions as CharacterConditionState[],
      ...(death ? { death } : {}),
      updatedAtTotalDays,
    },
    fortune: {
      value: fortuneValue,
      level: value.fortune.level as CharacterFortuneLevel,
      guidance: fortuneGuidance,
    },
    morality: {
      value: moralityValue,
      level: value.morality.level as CharacterMoralityLevel,
      roundDelta: moralityRoundDelta,
      guidance: moralityGuidance,
    },
    guidance,
    lastAnalyzedAtTotalDays,
  }
}
