/**
 * Purpose: Derive and validate world-context capabilities and runtime subsystem membership.
 * Owner: mod-world / contextual-capability-profile.
 * Responsibility: Capability policy only; identifiers, graphs, and context persistence stay outside.
 */

import type { ContextCapability, ContextCapabilityProfile } from '@/foundation'
import { WORLDVIEW_TAG_DEFAULTS } from '../../constants/world-tag-defaults'
import type { WorldConfig } from '../../types'

export const P0_FOUNDATION_SUBSYSTEM_IDS = [
  'world-context-registry',
  'contextual-capability-profile',
  'spatial-graph',
  'context-transition',
  'simulation-scope-policy',
  'world-init',
] as const

const CURRENT_WORLD_SUBSYSTEM_IDS = [
  'character-base',
  'destiny-pattern',
  'growth-system',
  'historical-event-ledger',
] as const

export const REQUIRED_CONTEXT_SUBSYSTEM_IDS = [
  ...P0_FOUNDATION_SUBSYSTEM_IDS,
  ...CURRENT_WORLD_SUBSYSTEM_IDS,
] as const

export const CONTEXT_CAPABILITY_SUBSYSTEM_POLICY: Readonly<
  Record<ContextCapability, { enabledSubsystemIds: readonly string[]; backgroundSubsystemIds: readonly string[] }>
> = {
  life: { enabledSubsystemIds: [], backgroundSubsystemIds: [] },
  space: { enabledSubsystemIds: [], backgroundSubsystemIds: [] },
  technology: {
    enabledSubsystemIds: ['culture-tech'],
    backgroundSubsystemIds: ['culture-tech'],
  },
  supernatural: {
    enabledSubsystemIds: ['combat-power', 'cultivation'],
    backgroundSubsystemIds: ['combat-power', 'cultivation'],
  },
}

const KNOWN_LIFE_ESSENCE_TAGS = new Set([
  ...Object.keys(WORLDVIEW_TAG_DEFAULTS),
  'cultivation',
  'wuxia',
  'dark-fantasy',
  'mythological',
  'lovecraftian',
].map(normalizeStructuredTagKey))

const ORGANIZED_CIVILIZATION_STAGES = new Set([
  'ancient',
  'medieval',
  'renaissance',
  'industrial',
  'modern',
  'information',
  'space',
])
const TECHNOLOGICAL_CIVILIZATION_STAGES = new Set([
  'industrial',
  'modern',
  'information',
  'space',
])
const TECHNOLOGICAL_POWER_SYSTEM_TAGS = new Set(['technology'])
const SUPERNATURAL_POWER_SYSTEM_TAGS = new Set([
  'cultivation',
  'magic',
  'psi',
  'martial',
  'faith',
  'mixed',
])
const VALID_CONTEXT_CAPABILITIES = new Set<ContextCapability>([
  'life',
  'space',
  'technology',
  'supernatural',
])

function normalizeStructuredTagKey(value: string): string {
  return value.trim().replaceAll('-', '').replaceAll('_', '').toLowerCase()
}

function splitStructuredTags(value: string): string[] {
  return value.split('+').map((tag) => tag.trim()).filter(Boolean)
}

function containsKnownTag(value: string, knownTags: ReadonlySet<string>): boolean {
  return splitStructuredTags(value).some((tag) => knownTags.has(normalizeStructuredTagKey(tag)))
}

function mergeUniqueIds(...groups: readonly (readonly string[])[]): string[] {
  return [...new Set(groups.flatMap((group) => [...group]))]
}

export function normalizeConfirmedCapabilities(
  capabilities: readonly ContextCapability[],
): ContextCapability[] {
  const normalized = new Set<ContextCapability>(['space'])
  for (const capability of capabilities) {
    if (!VALID_CONTEXT_CAPABILITIES.has(capability)) {
      throw new Error(`未知上下文能力：${String(capability)}`)
    }
    normalized.add(capability)
  }
  return [...normalized]
}

export function alignCapabilityProfileRuntimeMembership(
  profile: ContextCapabilityProfile,
): ContextCapabilityProfile {
  const capabilities = normalizeConfirmedCapabilities(profile.capabilities)
  const policies = capabilities.map((capability) => CONTEXT_CAPABILITY_SUBSYSTEM_POLICY[capability])
  return {
    ...profile,
    capabilities,
    enabledSubsystemIds: mergeUniqueIds(
      REQUIRED_CONTEXT_SUBSYSTEM_IDS,
      ...policies.map((policy) => policy.enabledSubsystemIds),
    ),
    backgroundSubsystemIds: mergeUniqueIds(
      ...policies.map((policy) => policy.backgroundSubsystemIds),
    ),
  }
}

export function deriveCapabilityProfile(
  contextId: string,
  config: WorldConfig,
  derivedFrom: ContextCapabilityProfile['derivedFrom'] = 'world-config',
  confirmedCapabilities?: readonly ContextCapability[],
): ContextCapabilityProfile {
  const capabilities = new Set<ContextCapability>(
    confirmedCapabilities ? normalizeConfirmedCapabilities(confirmedCapabilities) : ['space'],
  )
  if (!confirmedCapabilities) {
    const supportsLife = containsKnownTag(config.essenceTag, KNOWN_LIFE_ESSENCE_TAGS)
    const technological = TECHNOLOGICAL_CIVILIZATION_STAGES.has(config.civilizationStage)
      || containsKnownTag(config.powerSystemTag, TECHNOLOGICAL_POWER_SYSTEM_TAGS)
    const supernatural = containsKnownTag(config.powerSystemTag, SUPERNATURAL_POWER_SYSTEM_TAGS)
    if (supportsLife) {
      capabilities.add('life')
    }
    if (technological) capabilities.add('technology')
    if (supernatural) capabilities.add('supernatural')
  }

  return alignCapabilityProfileRuntimeMembership({
    contextId,
    capabilities: [...capabilities],
    enabledSubsystemIds: [],
    backgroundSubsystemIds: [],
    derivedFrom: confirmedCapabilities ? 'confirmed-facts' : derivedFrom,
  })
}
