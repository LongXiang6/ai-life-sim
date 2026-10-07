/**
 * Purpose: Expose character-base transaction operations across MOD boundaries.
 * Owner: mod-character
 * Responsibility: Public transaction boundary only; character state remains owned by CharacterBaseSystem.
 */

import { getCharacterBaseSystem } from './subsystems/character-base-system'

export type CharacterBaseTransactionSnapshot = ReturnType<
  ReturnType<typeof getCharacterBaseSystem>['captureTransactionState']
>

export function captureCharacterBaseTransactionState(): CharacterBaseTransactionSnapshot {
  return getCharacterBaseSystem().captureTransactionState()
}

export function restoreCharacterBaseTransactionState(snapshot: unknown): void {
  getCharacterBaseSystem().restoreTransactionState(snapshot)
}
