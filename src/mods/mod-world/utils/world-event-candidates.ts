/**
 * Purpose: Select deterministic, read-only world-event candidates for one story round.
 * Owner: mod-world / world-event catalog.
 * Responsibility: Normalize caller input, evaluate reservations, rank catalog entries, and build candidates.
 */

import type {
  WorldContextInstance,
  WorldEventCandidate,
  WorldEventCandidateBatch,
  WorldEventCandidateInput,
  WorldEventCategory,
} from '../types'
import {
  CATEGORY_LABELS,
  CATEGORY_ORDER,
  INTENSITY_LABELS,
  type WorldEventCatalogEntry,
  type WorldEventCatalogInput,
  getWorldEventModifier,
} from './world-event-catalog'
import { WORLD_EVENT_CATALOG } from './world-event-catalog-entries'

const DEFAULT_STORY_SEED = 'world-story'
const DEFAULT_MAX_CANDIDATES = 2
const MAX_CANDIDATES = 3

function fnv1a(value: string): number {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function hashUnit(value: string): number {
  return fnv1a(value) / 0x1_0000_0000
}

function normalizeRound(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
}

function normalizeMaxCandidates(value: number | undefined): number {
  if (!Number.isFinite(value)) return DEFAULT_MAX_CANDIDATES
  return Math.max(1, Math.min(MAX_CANDIDATES, Math.floor(value as number)))
}

function normalizeInput(input: WorldEventCandidateInput): WorldEventCatalogInput {
  return {
    contextId: input.contextId.trim() || 'world',
    ...(input.regionId?.trim() ? { regionId: input.regionId.trim() } : {}),
    worldConfig: input.worldConfig ?? null,
    worldTags: input.worldTags ?? null,
    legacyWorldTags: input.legacyWorldTags ?? [],
    calibration: input.calibration ?? null,
    regionProfile: input.regionProfile ?? null,
    roundSequence: normalizeRound(input.roundSequence),
    storySeed: input.storySeed?.trim() || DEFAULT_STORY_SEED,
    cooldownState: input.cooldownState,
  }
}

/**
 * Evaluate a caller-owned reservation. A candidate is eligible only after the
 * configured number of complete rounds has elapsed beyond its reservation.
 */
export function isWorldEventCooldownReady(
  currentRound: number,
  lastGeneratedRound: number | undefined,
  cooldownRounds: number,
): boolean {
  if (lastGeneratedRound === undefined || !Number.isFinite(lastGeneratedRound)) return true
  return normalizeRound(currentRound) - normalizeRound(lastGeneratedRound) > Math.max(0, Math.floor(cooldownRounds))
}

function scheduledCooldownReady(input: WorldEventCatalogInput, entry: WorldEventCatalogEntry): boolean {
  if (entry.cooldownRounds <= 0) return true
  const period = entry.cooldownRounds + 1
  const phase = fnv1a(`${input.storySeed}|${input.contextId}|${entry.key}`) % period
  return (input.roundSequence + phase) % period === 0
}

function cooldownReady(input: WorldEventCatalogInput, entry: WorldEventCatalogEntry): boolean {
  const lastGeneratedRound = input.cooldownState?.[entry.key]
  if (lastGeneratedRound !== undefined) {
    return isWorldEventCooldownReady(input.roundSequence, lastGeneratedRound, entry.cooldownRounds)
  }
  return scheduledCooldownReady(input, entry)
}

function triggerLabel(entry: WorldEventCatalogEntry, input: WorldEventCatalogInput): string {
  const modifier = entry.category === 'hazard'
    ? getWorldEventModifier(input, 'disasterFrequencyModifier')
    : entry.category === 'migration'
      ? getWorldEventModifier(input, 'migrationRateModifier')
      : entry.category === 'technology'
        ? getWorldEventModifier(input, 'techProgressModifier')
        : undefined
  if (modifier !== undefined && modifier !== 1) {
    return `${entry.triggerLabel}；本地修正为${modifier.toFixed(2)}`
  }
  return entry.triggerLabel
}

function buildCandidate(
  entry: WorldEventCatalogEntry,
  input: WorldEventCatalogInput,
  seedSelector: string,
): WorldEventCandidate {
  return {
    candidateKey: entry.key,
    category: entry.category,
    title: entry.title,
    fact: entry.buildFact(input),
    trigger: { kind: entry.triggerKind, label: triggerLabel(entry, input) },
    intensity: entry.intensity,
    cooldownRounds: entry.cooldownRounds,
    seedSelector,
    contextId: input.contextId,
    ...(input.regionId ? { regionId: input.regionId } : {}),
    generatedAtRound: input.roundSequence,
    adoptionInstruction: '可直接采用、在不改变类别和强度边界的前提下改写具体表现，或本轮暂不采用；候选本身不是已确认事实。',
  }
}

/** Build a pure, deterministic batch without writing stores or history. */
export function buildWorldEventCandidateBatch(
  input: WorldEventCandidateInput,
): WorldEventCandidateBatch {
  const normalized = normalizeInput(input)
  const maxCandidates = normalizeMaxCandidates(input.maxCandidates)
  const seedSelector = `${normalized.storySeed}|${normalized.contextId}|round:${normalized.roundSequence}`
  const eligible = WORLD_EVENT_CATALOG
    .filter((entry) => entry.isEligible(normalized) && cooldownReady(normalized, entry))
    .map((entry) => ({
      entry,
      score: hashUnit(`${seedSelector}|${entry.key}`) * Math.max(0.01, entry.weight(normalized)),
    }))
    .sort((left, right) => (
      right.score - left.score
      || CATEGORY_ORDER.indexOf(left.entry.category) - CATEGORY_ORDER.indexOf(right.entry.category)
      || left.entry.key.localeCompare(right.entry.key)
    ))

  const chosen: typeof eligible = []
  const chosenCategories = new Set<WorldEventCategory>()
  for (const item of eligible) {
    if (chosen.length >= maxCandidates) break
    if (chosenCategories.has(item.entry.category) && eligible.some((other) => !chosenCategories.has(other.entry.category))) continue
    chosen.push(item)
    chosenCategories.add(item.entry.category)
  }
  if (chosen.length < maxCandidates) {
    for (const item of eligible) {
      if (chosen.length >= maxCandidates || chosen.includes(item)) continue
      chosen.push(item)
    }
  }

  const candidates = chosen.map(({ entry }) => buildCandidate(entry, normalized, seedSelector))
  const nextCooldownState: Record<string, number> = { ...(input.cooldownState ?? {}) }
  for (const candidate of candidates) nextCooldownState[candidate.candidateKey] = normalized.roundSequence
  return { seedSelector, candidates, nextCooldownState }
}

export { CATEGORY_LABELS as WORLD_EVENT_CATEGORY_LABELS, INTENSITY_LABELS as WORLD_EVENT_INTENSITY_LABELS }

/** Narrow helper for tests and diagnostics without exposing catalog entries. */
export function getWorldEventCatalogSize(): number {
  return WORLD_EVENT_CATALOG.length
}

/** Narrow diagnostic projection used by catalog acceptance checks. */
export function getWorldEventCatalogCategoryCounts(): Record<WorldEventCategory, number> {
  return WORLD_EVENT_CATALOG.reduce<Record<WorldEventCategory, number>>((counts, entry) => {
    counts[entry.category] += 1
    return counts
  }, Object.fromEntries(CATEGORY_ORDER.map((category) => [category, 0])) as Record<WorldEventCategory, number>)
}

/** Build candidate input from one already-owned world context snapshot. */
export function buildWorldEventCandidateInputFromContext(
  instance: WorldContextInstance,
  roundSequence: number,
  storySeed?: string,
): WorldEventCandidateInput {
  const regionId = instance.spatialGraph.currentRegionId
  return {
    contextId: instance.record.id,
    regionId,
    worldConfig: structuredClone(instance.worldConfig),
    worldTags: structuredClone(instance.tags),
    legacyWorldTags: [...instance.worldTags],
    calibration: structuredClone(instance.calibration),
    regionProfile: instance.spatialGraph.regionProfiles[regionId]
      ? structuredClone(instance.spatialGraph.regionProfiles[regionId])
      : null,
    roundSequence,
    storySeed,
  }
}

export type { WorldEventCatalogInput, WorldEventCatalogEntry }
