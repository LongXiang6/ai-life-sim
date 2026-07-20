'use client'

/** @module hooks.ts @mod mod-history-dynamics */

import { useHistoryDynamicsStore } from './store'

export function useHistoricalEvents() {
  return useHistoryDynamicsStore((state) => state.events)
}

export function useHistoricalCausalEdges() {
  return useHistoryDynamicsStore((state) => state.causalEdges)
}

export function useHistoricalEventCandidates() {
  return useHistoryDynamicsStore((state) => state.candidateAudits)
}

export function useHistoryDynamics() {
  return useHistoryDynamicsStore((state) => ({
    events: state.events,
    transitions: state.transitions,
    evidence: state.evidence,
    causalEdges: state.causalEdges,
    candidateAudits: state.candidateAudits,
    migrationMetadata: state.migrationMetadata,
  }))
}
