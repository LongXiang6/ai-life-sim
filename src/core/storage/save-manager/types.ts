/**
 * Purpose: Define the stable save metadata and manual-slot contract.
 * Owner: core:storage
 * Responsibility: Save-manager types and limits only; no persistence behavior.
 */

export interface SaveMetadata {
  slot: number
  name: string
  timestamp: number
  version: string
  worldName: string
  characterName: string
  totalRounds: number
  isAutoSave?: boolean
}

export const MAX_MANUAL_SAVE_SLOTS = 10
