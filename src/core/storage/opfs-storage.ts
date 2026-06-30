/**
 * @module opfs-storage.ts
 * @description Origin Private File System 封装 —— 大文件存储（存档快照等）
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
      await root.removeEntry(dirPath, { recursive: true })
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
