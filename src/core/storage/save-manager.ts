/**
 * Purpose: Expose the serialized public save-manager API.
 * Owner: core:storage
 * Responsibility: Queue public save commands and delegate index and OPFS work to focused components.
 */

import {
  deleteSaveUnlocked,
  loadSaveUnlocked,
  saveToSlotUnlocked,
  autoSaveUnlocked,
} from './save-manager/save-operations'
import {
  findFirstAvailableManualSlot,
  loadSaveIndex,
} from './save-manager/save-index'
import {
  MAX_MANUAL_SAVE_SLOTS,
  type SaveMetadata,
} from './save-manager/types'

export { MAX_MANUAL_SAVE_SLOTS, type SaveMetadata } from './save-manager/types'

let saveOperationTail: Promise<void> = Promise.resolve()

function enqueueSaveOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = saveOperationTail.then(operation)
  saveOperationTail = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

export const saveManager = {
  async createSave(
    name: string,
    worldName: string,
    characterName: string,
    data: Record<string, unknown>,
  ): Promise<SaveMetadata> {
    return enqueueSaveOperation(() => {
      const slot = findFirstAvailableManualSlot(loadSaveIndex())
      if (slot > MAX_MANUAL_SAVE_SLOTS) {
        throw new Error('10 个手动存档槽位均已占用，请先覆盖或删除一个存档')
      }
      return saveToSlotUnlocked(slot, name, worldName, characterName, data)
    })
  },

  async saveToSlot(
    slot: number,
    name: string,
    worldName: string,
    characterName: string,
    data: Record<string, unknown>,
  ): Promise<SaveMetadata> {
    return enqueueSaveOperation(() => saveToSlotUnlocked(
      slot,
      name,
      worldName,
      characterName,
      data,
    ))
  },

  listSaves(): SaveMetadata[] {
    return loadSaveIndex().sort((left, right) => right.timestamp - left.timestamp)
  },

  async loadSave(slot: number): Promise<Record<string, unknown> | null> {
    return enqueueSaveOperation(() => loadSaveUnlocked(slot))
  },

  async deleteSave(slot: number): Promise<void> {
    return enqueueSaveOperation(() => deleteSaveUnlocked(slot))
  },

  async autoSave(
    worldName: string,
    characterName: string,
    data: Record<string, unknown>,
    shouldCommit: () => boolean = () => true,
  ): Promise<SaveMetadata | null> {
    return enqueueSaveOperation(() => autoSaveUnlocked(
      worldName,
      characterName,
      data,
      shouldCommit,
    ))
  },

  getNextSlot(): number {
    return findFirstAvailableManualSlot(loadSaveIndex())
  },

  slotExists(slot: number): boolean {
    return loadSaveIndex().some((metadata) => metadata.slot === slot)
  },
}
