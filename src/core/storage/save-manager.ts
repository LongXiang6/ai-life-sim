/**
 * @module save-manager.ts
 * @description 存档管理器 —— 存档的创建、列表、加载、删除
 * @mod core
 *
 * 存储方式：
 *   轻量元数据（索引）→ localStorage（configStore）
 *   大体积数据（世界快照、角色状态）→ OPFS（opfsStorage）
 *
 * 存档结构：
 *   /save/{slot}/meta.json    → SaveMetadata
 *   /save/{slot}/world.json   → 世界状态
 *   /save/{slot}/char.json    → 角色状态
 *   /save/{slot}/engine.json  → 引擎状态
 *
 * 版本守卫：
 *   metadata.version 记录创建时的引擎版本；
 *   加载时拒绝更新引擎写入的存档，旧版本存档按兼容路径加载并标记。
 */

import { configStore } from './local-storage'
import { opfsStorage } from './opfs-storage'
import { ENGINE_VERSION } from '../version'

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

/** 存档元数据 */
export interface SaveMetadata {
  slot: number
  name: string
  timestamp: number
  version: string
  worldName: string
  characterName: string
  totalRounds: number
  /** 是否为临时自动存档 */
  isAutoSave?: boolean
}

const MOD_KEY = 'save-manager'
const KEY_INDEX = 'index'
const REQUIRED_CORE_SAVE_FILES = ['engine', 'character', 'world'] as const

/**
 * OPFS 目录替换与 localStorage 索引必须作为一个串行事务执行。
 * 自动存档是 fire-and-forget；若不排队，它可能与手动存档同时读到旧索引，
 * 最后完成者会覆盖另一方的元数据更新。
 */
let saveOperationTail: Promise<void> = Promise.resolve()

function enqueueSaveOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = saveOperationTail.then(operation)
  saveOperationTail = result.then(
    () => undefined,
    () => undefined,
  )
  return result
}

/**
 * 读取所有存档元数据索引（存于 configStore，不关联特定存档槽）
 */
function loadIndex(): SaveMetadata[] {
  return configStore.get<SaveMetadata[]>(MOD_KEY, KEY_INDEX) ?? []
}

/**
 * 保存所有存档元数据索引
 */
function saveIndex(metaList: SaveMetadata[]): void {
  configStore.set(MOD_KEY, KEY_INDEX, metaList)
}

function findFirstAvailableManualSlot(metaList: SaveMetadata[]): number {
  const occupied = new Set(metaList.filter((meta) => meta.slot > 0).map((meta) => meta.slot))
  let slot = 1
  while (occupied.has(slot)) slot++
  return slot
}

function saveDir(slot: number): string {
  return `save/${slot}`
}

function makeWorkDir(slot: number, kind: 'tmp' | 'bak'): string {
  return `save/${slot}.${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

async function writePayloadToDir(dir: string, data: Record<string, unknown>): Promise<void> {
  const encoder = new TextEncoder()
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue
    const json = JSON.stringify(value, null, 2)
    await opfsStorage.writeFile(`${dir}/${key}.json`, encoder.encode(json).buffer)
  }
}

async function copyDirFiles(fromDir: string, toDir: string): Promise<void> {
  const files = await opfsStorage.listFiles(fromDir)
  for (const filePath of files) {
    const fileName = filePath.split('/').pop()
    if (!fileName) continue
    const buffer = await opfsStorage.readFile(filePath)
    if (!buffer) {
      throw new Error(`复制存档目录失败：无法读取 ${filePath}`)
    }
    await opfsStorage.writeFile(`${toDir}/${fileName}`, buffer)
  }
}

interface SaveDirTransaction {
  commit: () => Promise<void>
  rollback: () => Promise<void>
}

async function replaceSaveDir(slot: number, tmpDir: string): Promise<SaveDirTransaction> {
  const targetDir = saveDir(slot)
  const backupDir = makeWorkDir(slot, 'bak')
  let hasBackup = false
  let targetMutationStarted = false

  try {
    if ((await opfsStorage.listFiles(targetDir)).length > 0) {
      await copyDirFiles(targetDir, backupDir)
      hasBackup = true
    }

    targetMutationStarted = true
    await opfsStorage.deleteDirectory(targetDir)
    await copyDirFiles(tmpDir, targetDir)
    await opfsStorage.deleteDirectory(tmpDir)
  } catch (err) {
    try {
      if (targetMutationStarted) {
        await opfsStorage.deleteDirectory(targetDir)
        if (hasBackup) await copyDirFiles(backupDir, targetDir)
      }
      if (hasBackup) await opfsStorage.deleteDirectory(backupDir)
      await opfsStorage.deleteDirectory(tmpDir)
    } catch (rollbackError) {
      throw new Error('存档目录替换失败，且旧存档回滚未完成。', {
        cause: { originalError: err, rollbackError },
      })
    }
    throw err
  }

  let settled = false
  return {
    commit: async () => {
      if (settled) return
      settled = true
      if (!hasBackup) return
      try {
        await opfsStorage.deleteDirectory(backupDir)
      } catch (error) {
        // 新存档与索引均已提交；遗留备份只占空间，不应把成功写入反报为失败。
        console.warn(`[save-manager] 存档槽 ${slot} 的事务备份清理失败:`, error)
      }
    },
    rollback: async () => {
      if (settled) return
      await opfsStorage.deleteDirectory(targetDir)
      if (hasBackup) await copyDirFiles(backupDir, targetDir)
      settled = true
      if (hasBackup) await opfsStorage.deleteDirectory(backupDir)
    },
  }
}

async function saveToSlotUnlocked(
  slot: number,
  name: string,
  worldName: string,
  characterName: string,
  data: Record<string, unknown>,
): Promise<SaveMetadata> {
  const metaList = loadIndex()
  const totalRounds = (data.engine as { totalRounds?: number } | undefined)?.totalRounds ?? 0
  const existingIdx = metaList.findIndex((m) => m.slot === slot)
  const existing = existingIdx >= 0 ? metaList[existingIdx] : undefined
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

  const tmpDir = makeWorkDir(slot, 'tmp')
  let transaction: SaveDirTransaction | null = null
  try {
    await writePayloadToDir(tmpDir, data)
    transaction = await replaceSaveDir(slot, tmpDir)

    if (existingIdx >= 0) metaList[existingIdx] = metadata
    else metaList.push(metadata)
    saveIndex(metaList)
    await transaction.commit()
  } catch (err) {
    await opfsStorage.deleteDirectory(tmpDir)
    if (transaction) {
      try {
        await transaction.rollback()
      } catch (rollbackError) {
        throw new Error(`存档槽 ${slot} 写入失败，且旧存档回滚未完成。`, {
          cause: { originalError: err, rollbackError },
        })
      }
    }
    throw err
  }

  return metadata
}

async function loadSaveUnlocked(slot: number): Promise<Record<string, unknown> | null> {
  const metaList = loadIndex()
  const meta = metaList.find((m) => m.slot === slot)
  if (!meta) return null

  const decoder = new TextDecoder()
  const data: Record<string, unknown> = { _meta: meta }

  const files = await opfsStorage.listFiles(`save/${slot}`)
  for (const filePath of files) {
    const fileName = filePath.split('/').pop()!
    if (fileName === 'meta.json') continue

    const buffer = await opfsStorage.readFile(filePath)
    if (buffer) {
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

  // 版本守卫：拒绝加载由更新引擎写入的存档，避免降级损坏。
  // 旧版本存档目前没有可执行的 save-version 迁移链，按兼容路径加载并标记。
  const versionDiff = compareVersions(meta.version, ENGINE_VERSION)
  if (versionDiff > 0) {
    throw new Error(`存档版本 ${meta.version} 高于当前引擎版本 ${ENGINE_VERSION}，请使用更新版本打开。`)
  }
  if (versionDiff < 0) {
    data._needsMigration = true
    console.info(`[save-manager] 存档版本（${meta.version}）低于当前引擎版本（${ENGINE_VERSION}），当前按兼容路径加载。`)
  }

  return data
}

async function deleteSaveUnlocked(slot: number): Promise<void> {
  const metaList = loadIndex()
  const idx = metaList.findIndex((m) => m.slot === slot)
  if (idx === -1) return

  metaList.splice(idx, 1)
  saveIndex(metaList)

  const files = await opfsStorage.listFiles(`save/${slot}`)
  for (const filePath of files) {
    await opfsStorage.deleteFile(filePath)
  }
}

async function autoSaveUnlocked(
  worldName: string,
  characterName: string,
  data: Record<string, unknown>,
): Promise<SaveMetadata> {
  const AUTO_SLOT = 0
  const metaList = loadIndex()
  let existing = metaList.find((m) => m.slot === AUTO_SLOT)

  const totalRounds = (data.engine as { totalRounds?: number } | undefined)?.totalRounds ?? 0

  const existingIdx = metaList.findIndex((m) => m.slot === AUTO_SLOT)
  existing = {
    ...(existing ?? { slot: AUTO_SLOT, name: '自动存档' }),
    timestamp: Date.now(),
    version: ENGINE_VERSION,
    worldName: worldName || '',
    characterName: characterName || '',
    totalRounds,
    isAutoSave: true,
  }

  const tmpDir = makeWorkDir(AUTO_SLOT, 'tmp')
  let transaction: SaveDirTransaction | null = null
  try {
    await writePayloadToDir(tmpDir, data)
    transaction = await replaceSaveDir(AUTO_SLOT, tmpDir)

    if (existingIdx >= 0) metaList[existingIdx] = existing
    else metaList.push(existing)
    saveIndex(metaList)
    await transaction.commit()
  } catch (err) {
    await opfsStorage.deleteDirectory(tmpDir)
    if (transaction) {
      try {
        await transaction.rollback()
      } catch (rollbackError) {
        throw new Error('自动存档写入失败，且旧自动存档回滚未完成。', {
          cause: { originalError: err, rollbackError },
        })
      }
    }
    throw err
  }

  return existing
}

/** 存档管理器 */
export const saveManager = {
  /**
   * 创建新存档
   *
   * @param name 存档名称
   * @param worldName 世界名称
   * @param characterName 角色名称
   * @param data 游戏状态数据（{ engine, world, character }）
   * @returns 新存档元数据
   */
  async createSave(
    name: string,
    worldName: string,
    characterName: string,
    data: Record<string, unknown>
  ): Promise<SaveMetadata> {
    return enqueueSaveOperation(() => {
      const slot = findFirstAvailableManualSlot(loadIndex())
      return saveToSlotUnlocked(slot, name, worldName, characterName, data)
    })
  },

  /**
   * 保存到指定槽位；若槽位已存在则覆盖。
   */
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

  /**
   * 列出所有存档
   *
   * @returns 存档元数据列表（按时间倒序）
   */
  listSaves(): SaveMetadata[] {
    return loadIndex().sort((a, b) => b.timestamp - a.timestamp)
  },

  /**
   * 加载存档数据
   *
   * @param slot 存档槽号
   * @returns 存档数据对象，不存在返回 null
   */
  async loadSave(slot: number): Promise<Record<string, unknown> | null> {
    return enqueueSaveOperation(() => loadSaveUnlocked(slot))
  },

  /**
   * 删除存档
   *
   * @param slot 存档槽号
   */
  async deleteSave(slot: number): Promise<void> {
    return enqueueSaveOperation(() => deleteSaveUnlocked(slot))
  },

  /**
   * 自动保存（覆盖式写入 slot 0 临时存档槽）
   *
   * 每 N 轮调用一次，将当前游戏状态写入 slot 0。
   * 如果 slot 0 已存在则覆盖，否则创建。
   *
   * @param worldName 世界名称
   * @param characterName 角色名称
   * @param data 游戏状态数据（{ engine, world, character }）
   * @returns 自动存档元数据
   */
  async autoSave(
    worldName: string,
    characterName: string,
    data: Record<string, unknown>,
  ): Promise<SaveMetadata> {
    return enqueueSaveOperation(() => autoSaveUnlocked(worldName, characterName, data))
  },

  /**
   * 获取下一个可用存档槽号
   */
  getNextSlot(): number {
    return findFirstAvailableManualSlot(loadIndex())
  },

  /**
   * 检查存档槽是否已占用
   */
  slotExists(slot: number): boolean {
    return loadIndex().some((m) => m.slot === slot)
  },
}
