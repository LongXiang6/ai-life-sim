/**
 * Purpose: Map active subsystem snapshots into the narrative event detector.
 * Owner: mod-engine / narrative event lifecycle.
 * Responsibility: Read-only projection only; no inferred business state or fallback owner.
 */

import type { DetectionStates } from './event-lifecycle-tracker'

function asRecord(data: unknown): Record<string, unknown> | undefined {
  return data !== null && typeof data === 'object' && !Array.isArray(data)
    ? data as Record<string, unknown>
    : undefined
}

export function mapSubsystemStatesToDetectionStates(
  subsystemDataById: Record<string, unknown>,
): DetectionStates {
  const mapped: DetectionStates = {}

  const characterBase = asRecord(subsystemDataById['character-base'])
  const characterStatus = asRecord(characterBase?.status)
  if (characterStatus) {
    mapped.characterStatus = characterStatus as DetectionStates['characterStatus']
  }

  const cultureTech = asRecord(subsystemDataById['culture-tech'])
  if (cultureTech) {
    mapped.cultureTechState = cultureTech as DetectionStates['cultureTechState']
  }

  const combatPower = asRecord(subsystemDataById['combat-power'])
  if (combatPower) {
    mapped.combatPowerState = combatPower as DetectionStates['combatPowerState']
  }

  return mapped
}
