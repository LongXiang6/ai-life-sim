/**
 * @module mod-loader.ts
 * @description MOD 加载器 V2 —— 全量预检 + 显式依赖顺序 + 原子注册
 * @mod core
 *
 * 加载流程：
 *   Phase 0: 预扫描 → 构建 mods 预扫描表（所有 MOD onInit 前可用）
 *   Phase 1: 依赖解析 + manifest.order 稳定排序
 *   Phase 2: 全量校验通过后按序注册
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
    if (modsTable.has(m.name)) {
      errors.push(`MOD 标识重复: ${m.name}`)
      continue
    }
    modsTable.set(m.name, {
      version: m.version,
      dependencies: m.dependencies,
      description: m.description,
    })
  }

  // === Phase 1: 依赖解析 + 深度排序 ===
  const { order, cycles, errors: dependencyErrors } = resolveDependenciesV2(manifests)
  errors.push(...dependencyErrors)

  if (cycles.length > 0 || errors.length > 0) {
    for (const cycle of cycles) {
      errors.push(`循环依赖检测: ${cycle.join(' → ')}`)
    }
    return { loaded: [], errors, cycles, modsTable }
  }

  // === Phase 2: 全量校验 ===
  const availableMods = manifests.map((m) => m.name)
  /** 全量能力表（Phase 0 预扫描，供 consumes 校验；避免互消费 MOD 按序加载时误报） */
  const declaredCaps = new Map<string, string>()
  for (const m of manifests) {
    for (const cap of m.provides) {
      const existing = declaredCaps.get(cap)
      if (existing) {
        errors.push(`能力 "${cap}" 重复声明: ${existing} 与 ${m.name}`)
        continue
      }
      declaredCaps.set(cap, m.name)
    }
  }
  const registeredRoutes = new Map<string, string>()

  for (const manifest of manifests) {
    for (const route of manifest.routes ?? []) {
      const existing = registeredRoutes.get(route.path)
      if (existing) {
        errors.push(`路由 "${route.path}" 重复注册: ${existing} 与 ${manifest.name}`)
        continue
      }
      registeredRoutes.set(route.path, manifest.name)
    }
  }

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

  }

  if (errors.length > 0) {
    return { loaded: [], errors, cycles: [], modsTable }
  }

  // === Phase 3: 校验完整通过后原子接线 ===
  for (const name of order) {
    const manifest = manifests.find((item) => item.name === name)!
    modRegistry.register(manifest)
    for (const route of manifest.routes ?? []) {
      modRegistry.registerRoute(name, route.path, route.page)
    }
  }

  return { loaded: [...order], errors: [], cycles: [], modsTable }
}
