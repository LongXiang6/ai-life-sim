/**
 * Purpose: Create stable world-context and globally namespaced entity identifiers.
 * Owner: mod-world / world-context runtime.
 * Responsibility: Identifier and context-kind rules only; no Store or graph mutation.
 */

import type { WorldContextKind } from '@/foundation'
import type { WorldConfig } from '../../types'

const MAP_CONTEXT_KINDS = new Set<WorldContextKind>([
  'world',
  'universe',
  'plane',
  'galaxy',
  'planet',
  'continent',
])

export function safeContextSegment(value: string): string {
  const normalized = value.trim().replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '')
  return normalized || 'unnamed'
}

export function createRuntimeId(prefix: string): string {
  const randomId = globalThis.crypto?.randomUUID?.()
    ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  return `${prefix}_${randomId}`
}

export function createWorldContextId(options?: {
  contextId?: string
  legacyWorldCode?: number
}): string {
  if (options?.contextId?.trim()) return options.contextId.trim()
  if (options?.legacyWorldCode && options.legacyWorldCode > 0) {
    return `ctx_world_${options.legacyWorldCode}`
  }
  return createRuntimeId('ctx_world')
}

export function createGlobalEntityId(
  contextId: string,
  kind: 'entity' | 'space' | 'character',
  localId: string,
): string {
  const prefix = `${contextId}:${kind}:`
  if (localId.startsWith(prefix)) return localId
  return `${prefix}${safeContextSegment(localId)}`
}

export function inferContextKind(config: WorldConfig): WorldContextKind {
  switch (config.spatialForm) {
    case 'universe': return 'universe'
    case 'multiverse':
    case 'omniverse':
    case 'plane': return 'plane'
    case 'starSystems': return 'galaxy'
    case 'void': return 'abstract'
    default: return 'world'
  }
}

export function contextKindUsesRegionMap(contextKind: WorldContextKind): boolean {
  return MAP_CONTEXT_KINDS.has(contextKind)
}
