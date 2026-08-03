/**
 * Purpose: Atomically replace one OPFS save directory with rollback support.
 * Owner: core:storage
 * Responsibility: Temporary directories, payload copying, commit, and rollback only.
 */

import { opfsStorage } from '../opfs-storage'

function saveDirectory(slot: number): string {
  return `save/${slot}`
}

export function makeSaveWorkDirectory(slot: number, kind: 'tmp' | 'bak'): string {
  return `save/${slot}.${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export async function writePayloadToDirectory(
  directory: string,
  data: Record<string, unknown>,
): Promise<void> {
  const encoder = new TextEncoder()
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue
    const json = JSON.stringify(value, null, 2)
    await opfsStorage.writeFile(`${directory}/${key}.json`, encoder.encode(json).buffer)
  }
}

async function copyDirectoryFiles(fromDirectory: string, toDirectory: string): Promise<void> {
  const files = await opfsStorage.listFiles(fromDirectory)
  for (const filePath of files) {
    const fileName = filePath.split('/').pop()
    if (!fileName) continue
    const buffer = await opfsStorage.readFile(filePath)
    if (!buffer) throw new Error(`复制存档目录失败：无法读取 ${filePath}`)
    await opfsStorage.writeFile(`${toDirectory}/${fileName}`, buffer)
  }
}

export interface SaveDirectoryTransaction {
  commit: () => Promise<void>
  rollback: () => Promise<void>
}

export async function replaceSaveDirectory(
  slot: number,
  temporaryDirectory: string,
): Promise<SaveDirectoryTransaction> {
  const targetDirectory = saveDirectory(slot)
  const backupDirectory = makeSaveWorkDirectory(slot, 'bak')
  let hasBackup = false
  let targetMutationStarted = false

  try {
    if ((await opfsStorage.listFiles(targetDirectory)).length > 0) {
      await copyDirectoryFiles(targetDirectory, backupDirectory)
      hasBackup = true
    }
    targetMutationStarted = true
    await opfsStorage.deleteDirectory(targetDirectory)
    await copyDirectoryFiles(temporaryDirectory, targetDirectory)
    await opfsStorage.deleteDirectory(temporaryDirectory)
  } catch (error) {
    try {
      if (targetMutationStarted) {
        await opfsStorage.deleteDirectory(targetDirectory)
        if (hasBackup) await copyDirectoryFiles(backupDirectory, targetDirectory)
      }
      if (hasBackup) await opfsStorage.deleteDirectory(backupDirectory)
      await opfsStorage.deleteDirectory(temporaryDirectory)
    } catch (rollbackError) {
      throw new Error('存档目录替换失败，且旧存档回滚未完成。', {
        cause: { originalError: error, rollbackError },
      })
    }
    throw error
  }

  let settled = false
  return {
    commit: async () => {
      if (settled) return
      settled = true
      if (!hasBackup) return
      try {
        await opfsStorage.deleteDirectory(backupDirectory)
      } catch (error) {
        console.warn(`[save-manager] 存档槽 ${slot} 的事务备份清理失败:`, error)
      }
    },
    rollback: async () => {
      if (settled) return
      await opfsStorage.deleteDirectory(targetDirectory)
      if (hasBackup) await copyDirectoryFiles(backupDirectory, targetDirectory)
      settled = true
      if (hasBackup) await opfsStorage.deleteDirectory(backupDirectory)
    },
  }
}
