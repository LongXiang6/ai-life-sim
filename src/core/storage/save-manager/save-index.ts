/**
 * Purpose: Own save metadata indexing, slot validation, and version comparison.
 * Owner: core:storage
 * Responsibility: Lightweight config-store metadata only; OPFS payloads remain separate.
 */

import { configStore } from '../local-storage'
import { MAX_MANUAL_SAVE_SLOTS, type SaveMetadata } from './types'

const MOD_KEY = 'save-manager'
const KEY_INDEX = 'index'

export function compareVersions(left: string, right: string): number {
  const leftParts = left.split('.').map(Number)
  const rightParts = right.split('.').map(Number)
  for (let index = 0; index < 3; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

export function loadSaveIndex(): SaveMetadata[] {
  return configStore.get<SaveMetadata[]>(MOD_KEY, KEY_INDEX) ?? []
}

export function saveSaveIndex(metadata: SaveMetadata[]): void {
  configStore.set(MOD_KEY, KEY_INDEX, metadata)
}

export function findFirstAvailableManualSlot(metadata: SaveMetadata[]): number {
  const occupied = new Set(metadata.filter((item) => item.slot > 0).map((item) => item.slot))
  let slot = 1
  while (occupied.has(slot)) slot += 1
  return slot
}

export function assertManualSlot(slot: number): void {
  if (!Number.isInteger(slot) || slot < 1 || slot > MAX_MANUAL_SAVE_SLOTS) {
    throw new Error(`手动存档槽位必须在 1-${MAX_MANUAL_SAVE_SLOTS} 之间`)
  }
}
