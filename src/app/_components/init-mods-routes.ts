/**
 * @module init-mods-routes.ts
 * @description 轻量 MOD 路由注册 —— 仅 loadMods，供首屏尽快解除「加载中…」
 * @mod app
 */

import { loadMods } from '@/core/mod-loader/mod-loader'
import { modRegistry } from '@/core/mod-loader/mod-registry'

import type { LoadResult } from '@/core/mod-loader/mod-loader'

/** 同步注册全部 MOD 路由表（不执行 onInit / 迁移 / lifecycle） */
export async function registerModRoutes(): Promise<LoadResult> {
  const { MOD_REGISTRY } = await import('@/mods/registry')
  modRegistry.reset()
  return loadMods(MOD_REGISTRY)
}
