/**
 * @module mod-loader.ts
 * @description MOD 加载器 V2 —— Phase 0 预扫描 + 依赖解析 + 按序校验注册
 * @mod core
 *
 * 加载流程：
 *   Phase 0: 预扫描 → 构建 mods 预扫描表（所有 MOD onInit 前可用）
 *   Phase 1: 依赖解析 + 深度自动排序（取消 loadOrder）
 *   Phase 2: 按序加载（校验 + 注册 + 能力收集 + 路由 + 事件）
 */

import type { ModManifest, ModScanEntry } from '@/foundation'

import { modRegistry } from './mod-registry'
import { resolveDependenciesV2 } from './dependency-resolver'
import {
  validateDirectoryName,
  validateManifest,
  validateFeatureFlags,
} from './mod-validator'

/**
 * 引擎支持的功能开关（用于 validateFeatureFlags）
 */
export const ENGINE_FEATURE_FLAGS = {
  aiNarrative: true,
  eventBus: true,
  persistStore: true,
} as const

/**
 * defineMod —— 类型安全的 manifest 定义辅助函数
 * 规范来源：code-rules.md §4 Manifest 速查
 * @param manifest - MOD manifest 对象
 * @returns 相同的 manifest（类型检查通过）
 */
export function defineMod(manifest: ModManifest): ModManifest {
  return manifest
}

/** 加载结果 */
export interface LoadResult {
  loaded: string[],
  errors: string[],
  cycles: string[][],
  /** Phase 0 预扫描表（所有 MOD 加载前构建） */
  modsTable: Map<string, ModScanEntry>,
}

/**
 * MOD 加载器主函数 V2
 *
 * 与 v1 相比：
 *   - 新增 Phase 0 预扫描
 *   - 使用 resolveDependenciesV2（深度排序替代 loadOrder）
 *   - 支持 `~/?/!` 依赖前缀
 *
 * @param manifests - MOD manifest 列表
 * @returns 加载结果（已加载列表、错误、循环依赖、预扫描表）
 */
export function loadMods(manifests: ModManifest[]): LoadResult {
  const errors: string[] = []

  // === Phase 0: 预扫描（新增） ===
  // 在加载任何 MOD 之前，先构建 mods 表
  // MOD 的 onInit 中可从 context.mods 查询其他 MOD 是否存在
  const modsTable = new Map<string, ModScanEntry>()
  for (const m of manifests) {
    modsTable.set(m.name, {
      version: m.version,
      dependencies: m.dependencies,
      description: m.description,
    })
  }

  // === Phase 1: 依赖解析 + 深度排序 ===
  const { order, cycles } = resolveDependenciesV2(manifests)

  if (cycles.length > 0) {
    for (const cycle of cycles) {
      errors.push(`循环依赖检测: ${cycle.join(' → ')}`)
    }
    return { loaded: [], errors, cycles, modsTable }
  }

  // === Phase 2: 按序加载 ===
  const loaded: string[] = []
  const availableMods = manifests.map((m) => m.name)
  /** 全量能力表（Phase 0 预扫描，供 consumes 校验；避免互消费 MOD 按序加载时误报） */
  const declaredCaps = new Map<string, string>()
  for (const m of manifests) {
    for (const cap of m.provides) {
      declaredCaps.set(cap, m.name)
    }
  }
  const availableCaps = new Map<string, string>()
  const registeredRoutes = new Map<string, string>()

  for (const name of order) {
    const manifest = manifests.find((m) => m.name === name)
    if (!manifest) continue

    // a. 校验目录名
    const dirResult = validateDirectoryName(name)
    if (!dirResult.valid) {
      errors.push(...dirResult.errors)
      continue
    }

    // b. 校验 manifest（支持前缀格式）
    const maniResult = validateManifest(
      manifest,
      name,
      availableMods,
      declaredCaps,
    )
    if (!maniResult.valid) {
      errors.push(...maniResult.errors)
      continue
    }

    // c. 校验 Feature Flags
    if (manifest.featureFlags) {
      const ffErrors = validateFeatureFlags(manifest, ENGINE_FEATURE_FLAGS)
      if (ffErrors.length > 0) {
        errors.push(...ffErrors)
        continue
      }
    }

    // d. 注册到注册表
    modRegistry.register(manifest)

    // d. 注册能力
    for (const cap of manifest.provides) {
      availableCaps.set(cap, name)
    }

    // e. 注册路由（检测重复 path）
    if (manifest.routes) {
      for (const route of manifest.routes) {
        const existing = registeredRoutes.get(route.path)
        if (existing) {
          errors.push(
            `路由 "${route.path}" 重复注册: ${existing} 与 ${name}（保留先注册的 MOD）`,
          )
          continue
        }
        registeredRoutes.set(route.path, name)
        modRegistry.registerRoute(name, route.path, route.page)
      }
    }

    // f. 注册事件
    if (manifest.events) {
      for (const event of manifest.events.listens) {
        void event
      }
    }

    loaded.push(name)
  }

  return { loaded, errors, cycles: [], modsTable }
}
