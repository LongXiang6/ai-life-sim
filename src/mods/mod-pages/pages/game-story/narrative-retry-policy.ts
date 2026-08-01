export const AUTO_NARRATIVE_RETRY_DELAYS_MS = [1200, 2500] as const

export interface AutoNarrativeRetryGate {
  generation: number
  inFlight: boolean
}

export function createAutoNarrativeRetryGate(): AutoNarrativeRetryGate {
  return { generation: 0, inFlight: false }
}

export function invalidateAutoNarrativeRetry(gate: AutoNarrativeRetryGate): void {
  gate.generation += 1
}

export async function runAutoNarrativeRetryAttempt(
  gate: AutoNarrativeRetryGate,
  generation: number,
  attempt: () => Promise<void>,
): Promise<boolean> {
  if (generation !== gate.generation || gate.inFlight) return false

  gate.inFlight = true
  try {
    await attempt()
    return true
  } finally {
    gate.inFlight = false
  }
}

export function getAutoNarrativeRetryDelay(attempt: number): number | null {
  if (!Number.isInteger(attempt) || attempt < 0) return null
  return AUTO_NARRATIVE_RETRY_DELAYS_MS[attempt] ?? null
}
