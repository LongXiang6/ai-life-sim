/**
 * Purpose: Own the one-shot player action passed to the next accepted narrative round.
 * Owner: mod-engine
 * Responsibility: Normalize, project, and conditionally consume the action only.
 */

export interface PlayerRoundActionConsumption {
  nextChoice?: string
  consumed: boolean
}

export function normalizePlayerRoundAction(choice: string | undefined): string | undefined {
  return choice?.trim() || undefined
}

export function buildPlayerRoundActionProjection(
  choice: string | undefined,
): Record<string, unknown> | undefined {
  const normalized = normalizePlayerRoundAction(choice)
  return normalized ? { 当前状态: normalized } : undefined
}

export function consumeAcceptedPlayerRoundAction(
  currentChoice: string | undefined,
  acceptedChoice: string | undefined,
): PlayerRoundActionConsumption {
  const current = normalizePlayerRoundAction(currentChoice)
  const accepted = normalizePlayerRoundAction(acceptedChoice)
  if (!accepted || current !== accepted) {
    return { ...(current ? { nextChoice: current } : {}), consumed: false }
  }
  return { consumed: true }
}
