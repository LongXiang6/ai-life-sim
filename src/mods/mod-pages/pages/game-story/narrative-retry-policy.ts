export const AUTO_NARRATIVE_RETRY_DELAYS_MS = [1200, 2500] as const

export function getAutoNarrativeRetryDelay(attempt: number): number | null {
  if (!Number.isInteger(attempt) || attempt < 0) return null
  return AUTO_NARRATIVE_RETRY_DELAYS_MS[attempt] ?? null
}
