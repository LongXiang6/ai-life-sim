/**
 * Purpose: Preserve the public world-context runtime API through focused owner modules.
 * Owner: mod-world / world-context runtime.
 * Responsibility: Public exports only; identifiers, capabilities, graphs, and instances remain independently owned.
 */

export {
  alignCapabilityProfileRuntimeMembership,
  CONTEXT_CAPABILITY_SUBSYSTEM_POLICY,
  deriveCapabilityProfile,
  normalizeConfirmedCapabilities,
  P0_FOUNDATION_SUBSYSTEM_IDS,
  REQUIRED_CONTEXT_SUBSYSTEM_IDS,
} from './world-context-runtime/capability-profile'
export { assertValidWorldContextHierarchy } from './world-context-runtime/hierarchy-validation'
export {
  contextKindUsesRegionMap,
  createGlobalEntityId,
  createRuntimeId,
  createWorldContextId,
  inferContextKind,
} from './world-context-runtime/identifiers'
export {
  buildSpatialGraph,
  createCrossContextExit,
  namespaceRegions,
} from './world-context-runtime/spatial-graph'
export {
  buildWorldContextInstance,
  cloneWorldTags,
  projectWorldContextInstance,
  syncLocalClock,
} from './world-context-runtime/context-instance'
