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
 * 版本迁移：
 *   metadata.version 记录创建时的引擎版本，
 *   加载时若版本不匹配，触发迁移逻辑（迁至 save-version.ts）。
 */

import { configStore } from './local-storage'
import { opfsStorage } from './opfs-storage'
import { ENGINE_VERSION } from '../version'

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

    const metadata: SaveMetadata = {
      slot,
      name: name || `存档 ${slot}`,
      timestamp: Date.now(),
      version: ENGINE_VERSION,
      worldName: worldName || '',
      characterName: characterName || '',
      totalRounds: 0,
    }

    // 保存元数据
    metaList.push(metadata)
    saveIndex(metaList)

    // 保存游戏数据到 OPFS
    const encoder = new TextEncoder()
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        const json = JSON.stringify(value, null, 2)
        await opfsStorage.writeFile(`save/${slot}/${key}.json`, encoder.encode(json).buffer)
      }
    }

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

    if (existing) {
      // 覆盖：更新元数据
      existing.timestamp = Date.now()
      existing.worldName = worldName
      existing.characterName = characterName
      existing.totalRounds = totalRounds
      existing.isAutoSave = true
      saveIndex(metaList)
    } else {
      // 创建新的自动存档条目
      existing = {
        slot: AUTO_SLOT,
        name: '自动存档',
        timestamp: Date.now(),
        version: ENGINE_VERSION,
        worldName: worldName || '',
        characterName: characterName || '',
        totalRounds,
        isAutoSave: true,
      }
      metaList.push(existing)
      saveIndex(metaList)
    }

    // 写入/覆盖 OPFS 数据
    const encoder = new TextEncoder()
    for (const [key, value] of Object.entries(data)) {
      if (value !== undefined) {
        const json = JSON.stringify(value, null, 2)
        await opfsStorage.writeFile(`save/${AUTO_SLOT}/${key}.json`, encoder.encode(json).buffer)
      }
    }

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
