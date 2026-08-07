/**
 * Purpose: Normalize and merge world Store aggregates before Zustand commits them.
 * Owner: mod-world / world Store.
 * Responsibility: Pure Store helper transformations; persistence and action dispatch stay outside.
 */

import type { SimulationScope } from '@/foundation'
import type { WorldConfig, WorldContextInstance } from '../types'
import { deriveCapabilityProfile } from '../utils/world-context-runtime'
import type { WorldStore } from './contracts'

export function updateCurrentContext(
  state: WorldStore,
  update: (instance: WorldContextInstance) => WorldContextInstance,
): Pick<WorldStore, 'contexts'> {
  const id = state.currentContextId
  if (!id || !state.contexts[id]) return { contexts: state.contexts }
  return {
    contexts: {
      ...state.contexts,
      [id]: update(structuredClone(state.contexts[id])),
    },
  }
}

export function deriveUpdatedCapabilityProfile(instance: WorldContextInstance, config: WorldConfig) {
  const confirmedCapabilities = instance.capabilityProfile.derivedFrom === 'confirmed-facts'
    ? instance.capabilityProfile.capabilities
    : undefined
  return deriveCapabilityProfile(
    instance.record.id,
    config,
    instance.capabilityProfile.derivedFrom,
    confirmedCapabilities,
  )
}

export function lifecycleForScope(scope: SimulationScope): WorldContextInstance['record']['lifecycle'] {
  if (scope === 'closed') return 'closed'
  if (scope === 'dormant') return 'dormant'
  return 'open'
}
