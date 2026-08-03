/**
 * Purpose: Execute unlocked manual-save, load, delete, and auto-save operations.
 * Owner: core:storage
 * Responsibility: One save operation per call; serialization queueing remains at the public entry.
 */

import { ENGINE_VERSION } from '../../version'
import { opfsStorage } from '../opfs-storage'
import {
  makeSaveWorkDirectory,
  replaceSaveDirectory,
  writePayloadToDirectory,
  type SaveDirectoryTransaction,
} from './save-directory-transaction'
import {
  assertManualSlot,
  compareVersions,
  loadSaveIndex,
  saveSaveIndex,
} from './save-index'
import type { SaveMetadata } from './types'

const REQUIRED_CORE_SAVE_FILES = ['engine', 'character', 'world'] as const

export async function saveToSlotUnlocked(
  slot: number,
  name: string,
  worldName: string,
  characterName: string,
  data: Record<string, unknown>,
): Promise<SaveMetadata> {
  assertManualSlot(slot)
  const metadataList = loadSaveIndex()
  const totalRounds = (data.engine as { totalRounds?: number } | undefined)?.totalRounds ?? 0
  const existingIndex = metadataList.findIndex((metadata) => metadata.slot === slot)
  const existing = existingIndex >= 0 ? metadataList[existingIndex] : undefined
  const metadata: SaveMetadata = {
    ...(existing ?? { slot }),
    name: name || `存档 ${slot}`,
    timestamp: Date.now(),
    version: ENGINE_VERSION,
    worldName: worldName || '',
    characterName: characterName || '',
    totalRounds,
    isAutoSave: false,
  }
  const temporaryDirectory = makeSaveWorkDirectory(slot, 'tmp')
  let transaction: SaveDirectoryTransaction | null = null
  try {
    await writePayloadToDirectory(temporaryDirectory, data)
    transaction = await replaceSaveDirectory(slot, temporaryDirectory)
    if (existingIndex >= 0) metadataList[existingIndex] = metadata
    else metadataList.push(metadata)
    saveSaveIndex(metadataList)
    await transaction.commit()
  } catch (error) {
    await opfsStorage.deleteDirectory(temporaryDirectory)
    if (transaction) {
      try {
        await transaction.rollback()
      } catch (rollbackError) {
        throw new Error(`存档槽 ${slot} 写入失败，且旧存档回滚未完成。`, {
          cause: { originalError: error, rollbackError },
        })
      }
    }
    throw error
  }
  return metadata
}

export async function loadSaveUnlocked(slot: number): Promise<Record<string, unknown> | null> {
  const metadata = loadSaveIndex().find((item) => item.slot === slot)
  if (!metadata) return null
  const decoder = new TextDecoder()
  const data: Record<string, unknown> = { _meta: metadata }
  const files = await opfsStorage.listFiles(`save/${slot}`)
  for (const filePath of files) {
    const fileName = filePath.split('/').pop()!
    if (fileName === 'meta.json') continue
    const buffer = await opfsStorage.readFile(filePath)
    if (!buffer) continue
    const key = fileName.replace('.json', '')
    try {
      data[key] = JSON.parse(decoder.decode(buffer))
    } catch (error) {
      if (REQUIRED_CORE_SAVE_FILES.includes(key as typeof REQUIRED_CORE_SAVE_FILES[number])) {
        throw new Error(`存档槽 ${slot} 的核心文件 ${fileName} 已损坏，已中止加载。`, {
          cause: error,
        })
      }
      console.warn(`[save-manager] 存档槽 ${slot} 的可选文件 ${fileName} 已损坏，已跳过。`)
    }
  }
  const missingCoreFiles = REQUIRED_CORE_SAVE_FILES.filter((key) => {
    const value = data[key]
    return !value || typeof value !== 'object' || Array.isArray(value)
  })
  if (missingCoreFiles.length > 0) {
    throw new Error(
      `存档槽 ${slot} 缺少有效核心文件：${missingCoreFiles.map((key) => `${key}.json`).join('、')}，已中止加载。`,
    )
  }
  const versionDifference = compareVersions(metadata.version, ENGINE_VERSION)
  if (versionDifference > 0) {
    throw new Error(`存档版本 ${metadata.version} 高于当前引擎版本 ${ENGINE_VERSION}，请使用更新版本打开。`)
  }
  if (versionDifference < 0) {
    data._needsMigration = true
    console.info(`[save-manager] 存档版本（${metadata.version}）低于当前引擎版本（${ENGINE_VERSION}），当前按兼容路径加载。`)
  }
  return data
}

export async function deleteSaveUnlocked(slot: number): Promise<void> {
  const metadataList = loadSaveIndex()
  const index = metadataList.findIndex((metadata) => metadata.slot === slot)
  if (index === -1) return
  metadataList.splice(index, 1)
  saveSaveIndex(metadataList)
  const files = await opfsStorage.listFiles(`save/${slot}`)
  for (const filePath of files) await opfsStorage.deleteFile(filePath)
}

export async function autoSaveUnlocked(
  worldName: string,
  characterName: string,
  data: Record<string, unknown>,
  shouldCommit: () => boolean,
): Promise<SaveMetadata | null> {
  const slot = 0
  if (!shouldCommit()) return null
  const metadataList = loadSaveIndex()
  const existingIndex = metadataList.findIndex((metadata) => metadata.slot === slot)
  const existing = existingIndex >= 0 ? metadataList[existingIndex] : undefined
  const metadata: SaveMetadata = {
    ...(existing ?? { slot, name: '自动存档' }),
    timestamp: Date.now(),
    version: ENGINE_VERSION,
    worldName: worldName || '',
    characterName: characterName || '',
    totalRounds: (data.engine as { totalRounds?: number } | undefined)?.totalRounds ?? 0,
    isAutoSave: true,
  }
  const temporaryDirectory = makeSaveWorkDirectory(slot, 'tmp')
  let transaction: SaveDirectoryTransaction | null = null
  try {
    await writePayloadToDirectory(temporaryDirectory, data)
    if (!shouldCommit()) {
      await opfsStorage.deleteDirectory(temporaryDirectory)
      return null
    }
    transaction = await replaceSaveDirectory(slot, temporaryDirectory)
    if (!shouldCommit()) {
      const staleTransaction = transaction
      transaction = null
      try {
        await staleTransaction.rollback()
      } catch (rollbackError) {
        throw new Error('过期自动存档已取消，但旧自动存档回滚未完成。', {
          cause: rollbackError,
        })
      }
      return null
    }
    if (existingIndex >= 0) metadataList[existingIndex] = metadata
    else metadataList.push(metadata)
    saveSaveIndex(metadataList)
    await transaction.commit()
  } catch (error) {
    await opfsStorage.deleteDirectory(temporaryDirectory)
    if (transaction) {
      try {
        await transaction.rollback()
      } catch (rollbackError) {
        throw new Error('自动存档写入失败，且旧自动存档回滚未完成。', {
          cause: { originalError: error, rollbackError },
        })
      }
    }
    throw error
  }
  return metadata
}
