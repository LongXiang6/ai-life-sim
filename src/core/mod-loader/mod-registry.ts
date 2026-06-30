/**
 * @module mod-registry.ts
 * @description MOD 注册表 —— 存储已注册 MOD、提供查询接口
 * @mod core
 */

import type { ModManifest, ModLifecycle } from '@/foundation'

/** 已注册的 MOD 条目 */
export interface ModEntry {
  manifest: ModManifest,
  lifecycle?: ModLifecycle,
  /** MOD 公共 API（index.ts 导出的内容） */
  api?: Record<string, unknown>,
  /** MOD 路由表 */
  routes: Map<string, string>,
}

/** MOD 注册表 */
class ModRegistry {
  private mods = new Map<string, ModEntry>()
  private loadedOrder: string[] = []

  /** 注册 MOD */
  register(
    manifest: ModManifest,
    lifecycle?: ModLifecycle,
    api?: Record<string, unknown>,
  ): void {
    this.mods.set(manifest.name, {
      manifest,
      lifecycle,
      api,
      routes: new Map(),
    })
    this.loadedOrder.push(manifest.name)
  }

  /** 注册路由 */
  registerRoute(modName: string, path: string, pagePath: string): void {
    const entry = this.mods.get(modName)
    if (entry) {
      entry.routes.set(path, pagePath)
    }
  }

  /** 获取 MOD */
  get(name: string): ModEntry | undefined {
    return this.mods.get(name)
  }

  /** 获取 MOD 的公共 API */
  getMod<T>(name: string): T | undefined {
    return this.mods.get(name)?.api as T | undefined
  }

  /** 获取所有已注册 MOD 名称 */
  getModNames(): string[] {
    return [...this.mods.keys()]
  }

  /** 获取加载序列 */
  getLoadOrder(): string[] {
    return [...this.loadedOrder]
  }

  /** 根据路由路径查找 MOD */
  getRoute(urlPath: string): { modName: string; pagePath: string } | undefined {
    for (const [name, entry] of this.mods) {
      const pagePath = entry.routes.get(urlPath)
      if (pagePath) {
        return { modName: name, pagePath }
      }
    }
    return undefined
  }

  /** 获取所有可用能力 */
  getAvailableCapabilities(): Map<string, string> {
    const caps = new Map<string, string>()
    for (const [name, entry] of this.mods) {
      for (const cap of entry.manifest.provides) {
        caps.set(cap, name)
      }
    }
    return caps
  }

  /** 重置 */
  reset(): void {
    this.mods.clear()
    this.loadedOrder = []
  }
}

/** 全局单例 */
export const modRegistry = new ModRegistry()
