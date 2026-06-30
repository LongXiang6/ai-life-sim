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
    if (buffer) await opfsStorage.writeFile(`${toDir}/${fileName}`, buffer)
  }
}

async function replaceSaveDir(slot: number, tmpDir: string): Promise<void> {
  const targetDir = saveDir(slot)
  const backupDir = makeWorkDir(slot, 'bak')
  let hasBackup = false

  try {
    if ((await opfsStorage.listFiles(targetDir)).length > 0) {
      await copyDirFiles(targetDir, backupDir)
      hasBackup = true
    }

    await opfsStorage.deleteDirectory(targetDir)
    await copyDirFiles(tmpDir, targetDir)
    await opfsStorage.deleteDirectory(tmpDir)
    if (hasBackup) await opfsStorage.deleteDirectory(backupDir)
  } catch (err) {
    await opfsStorage.deleteDirectory(targetDir)
    if (hasBackup) {
      await copyDirFiles(backupDir, targetDir)
      await opfsStorage.deleteDirectory(backupDir)
    }
    await opfsStorage.deleteDirectory(tmpDir)
    throw err
  }
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
    const metaList = loadIndex()
    const slot = metaList.length > 0 ? Math.max(...metaList.map((m) => m.slot)) + 1 : 1
    return this.saveToSlot(slot, name, worldName, characterName, data)
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
    const backupDir = makeWorkDir(slot, 'bak')
    try {
      await writePayloadToDir(tmpDir, data)
      if ((await opfsStorage.listFiles(saveDir(slot))).length > 0) {
        await copyDirFiles(saveDir(slot), backupDir)
      }
      await replaceSaveDir(slot, tmpDir)

      if (existingIdx >= 0) metaList[existingIdx] = metadata
      else metaList.push(metadata)
      saveIndex(metaList)
    } catch (err) {
      await opfsStorage.deleteDirectory(tmpDir)
      await opfsStorage.deleteDirectory(saveDir(slot))
      if ((await opfsStorage.listFiles(backupDir)).length > 0) {
        await copyDirFiles(backupDir, saveDir(slot))
      }
      await opfsStorage.deleteDirectory(backupDir)
      throw err
    }
    await opfsStorage.deleteDirectory(backupDir)

    return metadata
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
        } catch {
          // 跳过无法解析的文件
        }
      }
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
  },

  /**
   * 删除存档
   *
   * @param slot 存档槽号
   */
  async deleteSave(slot: number): Promise<void> {
    const metaList = loadIndex()
    const idx = metaList.findIndex((m) => m.slot === slot)
    if (idx === -1) return

    metaList.splice(idx, 1)
    saveIndex(metaList)

    // 删除 OPFS 文件
    const files = await opfsStorage.listFiles(`save/${slot}`)
    for (const filePath of files) {
      await opfsStorage.deleteFile(filePath)
    }
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
    const backupDir = makeWorkDir(AUTO_SLOT, 'bak')
    try {
      await writePayloadToDir(tmpDir, data)
      if ((await opfsStorage.listFiles(saveDir(AUTO_SLOT))).length > 0) {
        await copyDirFiles(saveDir(AUTO_SLOT), backupDir)
      }
      await replaceSaveDir(AUTO_SLOT, tmpDir)

      if (existingIdx >= 0) metaList[existingIdx] = existing
      else metaList.push(existing)
      saveIndex(metaList)
    } catch (err) {
      await opfsStorage.deleteDirectory(tmpDir)
      await opfsStorage.deleteDirectory(saveDir(AUTO_SLOT))
      if ((await opfsStorage.listFiles(backupDir)).length > 0) {
        await copyDirFiles(backupDir, saveDir(AUTO_SLOT))
      }
      await opfsStorage.deleteDirectory(backupDir)
      throw err
    }
    await opfsStorage.deleteDirectory(backupDir)

    return existing
  },

  /**
   * 获取下一个可用存档槽号
   */
  getNextSlot(): number {
    const saves = this.listSaves()
    if (saves.length === 0) return 1
    return Math.max(...saves.map((s) => s.slot)) + 1
  },

  /**
   * 检查存档槽是否已占用
   */
  slotExists(slot: number): boolean {
    return loadIndex().some((m) => m.slot === slot)
  },
}
