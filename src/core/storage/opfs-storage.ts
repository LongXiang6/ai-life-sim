/**
 * @module opfs-storage.ts
 * @description Origin Private File System 封装 —— 大文件存储（存档快照等）+ flat-key 键值同步
 * @mod core
 *
 * OPFS (Origin Private File System) 是浏览器提供的本地文件系统 API，
 * 支持大文件分块读写，适合存储游戏存档快照等大体积数据。
 *
 * API：navigator.storage.getDirectory() → FileSystemDirectoryHandle
 *
 * 使用方式：
 *   import { opfsStorage } from '@/core'
 *   await opfsStorage.writeFile('save/1/world.json', buffer)
 *   const data = await opfsStorage.readFile('save/1/world.json')
 *
 * ==== flat-key 键值同步 API（用于 localStorage 双重备份）====
 *
 *   isOPFSSupported()        → 检测 OPFS 是否可用
 *   opfsRestoreAll()          → 启动时从 OPFS 读出全部键值
 *   opfsFlushQueue(entries)   → 批量同步键值到 OPFS（写或删）
 */

/** 获取 OPFS 根目录句柄 */
async function getRoot(): Promise<FileSystemDirectoryHandle> {
  return await navigator.storage.getDirectory()
}

/** OPFS 存储 */
export const opfsStorage = {
  /**
   * 写入文件（自动创建父目录）
   *
   * @param path 文件路径（如 "save/1/world.json"）
   * @param data 文件内容
   */
  async writeFile(path: string, data: ArrayBuffer | string): Promise<void> {
    try {
      const root = await getRoot()
      const parts = path.split('/')
      const fileName = parts.pop()!

      let currentDir = root
      for (const part of parts) {
        if (!part) continue
        currentDir = await currentDir.getDirectoryHandle(part, { create: true })
      }

      const fileHandle = await currentDir.getFileHandle(fileName, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(data)
      await writable.close()
    } catch (err) {
      throw new Error(`OPFS writeFile 失败: ${path}`, { cause: err })
    }
  },

  /**
   * 读取文件
   *
   * @param path 文件路径
   * @returns ArrayBuffer 或 null（文件不存在时）
   */
  async readFile(path: string): Promise<ArrayBuffer | null> {
    try {
      const root = await getRoot()
      const parts = path.split('/')
      const fileName = parts.pop()!

      let currentDir = root
      for (const part of parts) {
        if (!part) continue
        currentDir = await currentDir.getDirectoryHandle(part, { create: false })
      }

      const fileHandle = await currentDir.getFileHandle(fileName, { create: false })
      const file = await fileHandle.getFile()
      return await file.arrayBuffer()
    } catch {
      return null
    }
  },

  /**
   * 删除文件
   *
   * @param path 文件路径
   */
  async deleteFile(path: string): Promise<void> {
    try {
      const root = await getRoot()
      const parts = path.split('/')
      const fileName = parts.pop()!

      let currentDir = root
      for (const part of parts) {
        if (!part) continue
        currentDir = await currentDir.getDirectoryHandle(part, { create: false })
      }

      await currentDir.removeEntry(fileName)
    } catch {
      // 文件不存在时不抛出
    }
  },

  /**
   * 检查文件是否存在
   *
   * @param path 文件路径
   */
  async exists(path: string): Promise<boolean> {
    try {
      const root = await getRoot()
      const parts = path.split('/')
      const fileName = parts.pop()!

      let currentDir = root
      for (const part of parts) {
        if (!part) continue
        currentDir = await currentDir.getDirectoryHandle(part, { create: false })
      }

      await currentDir.getFileHandle(fileName, { create: false })
      return true
    } catch {
      return false
    }
  },

  /**
   * 递归删除目录及其下所有文件
   *
   * @param dirPath 目录路径（如 "save"）
   */
  async deleteDirectory(dirPath: string): Promise<void> {
    try {
      const root = await getRoot()
      const parts = dirPath.split('/').filter(Boolean)
      const dirName = parts.pop()
      if (!dirName) return

      let currentDir = root
      for (const part of parts) {
        currentDir = await currentDir.getDirectoryHandle(part, { create: false })
      }

      await currentDir.removeEntry(dirName, { recursive: true })
    } catch {
      // 目录不存在时不抛出
    }
  },

  /**
   * 列出目录下所有文件
   *
   * @param dirPath 目录路径（如 "save/1"）
   */
  async listFiles(dirPath: string): Promise<string[]> {
    try {
      const root = await getRoot()
      const parts = dirPath.split('/').filter(Boolean)

      let currentDir = root
      for (const part of parts) {
        currentDir = await currentDir.getDirectoryHandle(part, { create: false })
      }

      const files: string[] = []
      for await (const [name] of (
        currentDir as unknown as { entries?: () => AsyncIterable<[string, unknown]> }
      ).entries?.() ?? []) {
        files.push(`${dirPath}/${name}`)
      }
      return files
    } catch {
      return []
    }
  },
}

// ============================================================
// flat-key 键值同步 API（localStorage 双重备份用）
// ============================================================

/** OPFS 支持检测（缓存结果，只测一次） */
let _opfsSupported: boolean | null = null
export function isOPFSSupported(): boolean {
  if (_opfsSupported !== null) return _opfsSupported
  try {
    _opfsSupported =
      typeof navigator !== 'undefined' &&
      typeof navigator.storage?.getDirectory === 'function'
  } catch {
    _opfsSupported = false
  }
  return _opfsSupported
}

/** 写入单个键值到 OPFS 根目录（flat file） */
async function flatWrite(key: string, value: string): Promise<void> {
  try {
    const root = await getRoot()
    const safeKey = encodeURIComponent(key)
    const handle = await root.getFileHandle(safeKey, { create: true })
    const writable = await handle.createWritable()
    await writable.write(value)
    await writable.close()
  } catch {
    // 写入失败静默忽略，localStorage 已有数据
  }
}

/** 从 OPFS 根目录删除单个键 */
async function flatDelete(key: string): Promise<void> {
  try {
    const root = await getRoot()
    const safeKey = encodeURIComponent(key)
    await root.removeEntry(safeKey)
  } catch {
    // 不存在则忽略
  }
}

/**
 * 批量同步键值到 OPFS
 *   - value 为 null → 删除
 *   - value 有值 → 写入
 */
export async function opfsFlushQueue(
  entries: Array<{ key: string; value: string | null }>,
): Promise<void> {
  for (const { key, value } of entries) {
    if (value === null) {
      await flatDelete(key)
    } else {
      await flatWrite(key, value)
    }
  }
}

/**
 * 从 OPFS 根目录读取全部文件，返回 { key, value } 列表
 * 用于启动时将 OPFS 数据恢复到 localStorage
 */
export async function opfsRestoreAll(): Promise<Array<{ key: string; value: string }>> {
  const results: Array<{ key: string; value: string }> = []
  try {
    const root = await getRoot()
    for await (const [name, handle] of root as unknown as AsyncIterable<[string, FileSystemHandle]>) {
      if (handle.kind !== 'file') continue
      try {
        const fh = handle as FileSystemFileHandle
        const file = await fh.getFile()
        const text = await file.text()
        const key = decodeURIComponent(name)
        results.push({ key, value: text })
      } catch {
        // 单文件读取失败跳过
      }
    }
  } catch {
    // OPFS 不可用时返回空
  }
  return results
}
