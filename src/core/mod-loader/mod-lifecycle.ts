/**
 * @module mod-lifecycle.ts
 * @description MOD 生命周期调用 V2 —— 窄 control 入口 + 独立 Remote / 子系统 import
 * @mod core
 *
 * Factorio 对齐：
 *   - control.lua → MOD_CONTROL_IMPORTERS（_internal/control.ts）
 *   - data.lua 子系统 → MOD_SUBSYSTEM_IMPORTERS（registerAllSubsystems）
 *   - index.ts Remote → MOD_API_IMPORTERS（onInit 完成后批量注册）
 */

import type { ModContext, ModLifecycle, ModLifecycleV2, ConfigurationChangedData } from '@/foundation'

import { modRegistry } from './mod-registry'
import { remote } from '../remote-interface/remote-interface'
import { isInstrumentEnabled, getInstrumentHooks } from '../instrument/instrument-mode'
import { createStorageNamespace } from '../storage-namespace'
import { validateRemoteContracts } from './validate-remote-contracts'
import { COMPAT_IMPORTERS } from './compat-importers.generated'
import { MOD_CONTROL_IMPORTERS } from './mod-control-importers.generated'
import { MOD_API_IMPORTERS } from './mod-importers.generated'
import { MOD_SECONDARY_API_IMPORTERS } from './mod-secondary-api-importers.generated'

/**
 * Factorio control.lua 等价 — lifecycle 窄入口
 * @param name - MOD 名称
 */
export function getModControlImporter(name: string): () => Promise<Record<string, unknown>> {
  const importer = MOD_CONTROL_IMPORTERS[name]
  if (!importer) {
    throw new Error(`[getModControlImporter] 未知 MOD "${name}" — 请确认 _internal/control.ts 存在并运行 npm run generate:wiring`)
  }
  return importer
}

/**
 * index.ts 全量 API — Remote 注册专用
 * @param name - MOD 名称
 */
export function getModApiImporter(name: string): () => Promise<Record<string, unknown>> {
  const importer = MOD_API_IMPORTERS[name]
  if (!importer) {
    throw new Error(`[getModApiImporter] 未知 MOD "${name}" — 请确认 src/mods/${name} 存在并运行 npm run generate:wiring`)
  }
  return importer
}

/**
 * @deprecated 使用 getModControlImporter（lifecycle）或 getModApiImporter（Remote）
 * @param name - MOD 名称
 */
export function getModImporter(name: string): () => Promise<Record<string, unknown>> {
  return getModControlImporter(name)
}

/**
 * 批量注册 Remote API（index.ts + secondaryPublicEntries，与 lifecycle 加载分离）
 */
async function registerModRemoteApis(order: string[]): Promise<void> {
  for (const name of order) {
    try {
      const merged: Record<string, unknown> = { ...(await getModApiImporter(name)()) }

      const secondaryImporters = MOD_SECONDARY_API_IMPORTERS[name]
      if (secondaryImporters) {
        for (const importSecondary of secondaryImporters) {
          Object.assign(merged, await importSecondary())
        }
      }

      remote.autoRegister(name, merged)
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      console.warn(`[mod-lifecycle] ${name} Remote 注册跳过: ${msg}`)
    }
  }
}

/**
 * 按加载顺序调用各 MOD 的 lifecycle.onInit
 *
 * @param context - MOD 上下文
 * @returns 错误列表（空数组表示全部成功）
 */
export async function invokeModLifecycles(
  context: ModContext,
): Promise<string[]> {
  const errors: string[] = []
  const order = modRegistry.getLoadOrder()

  for (const name of order) {
    try {
      const importer = getModControlImporter(name)

      if (isInstrumentEnabled()) {
        getInstrumentHooks().onBeforeInit?.(name)
      }
      const t0 = performance.now()

      const mod = await importer()
      const lifecycle = mod.lifecycle as ModLifecycle | undefined

      const perModContext: ModContext = {
        ...context,
        getStorage: <T extends Record<string, unknown> = Record<string, unknown>>() =>
          createStorageNamespace<T>(name, context.storage),
      }

      if (lifecycle?.onInit) {
        await lifecycle.onInit(perModContext)
      }

      if (isInstrumentEnabled()) {
        getInstrumentHooks().onAfterInit?.(name, performance.now() - t0)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`MOD "${name}" onInit 失败: ${msg}`)
    }
  }

  if (errors.length === 0) {
    await registerModRemoteApis(order)
  }

  await scanCompatibilityDirs(order)

  if (process.env.NODE_ENV === 'development') {
    const manifests = order
      .map((name) => modRegistry.get(name)?.manifest)
      .filter((m): m is NonNullable<typeof m> => m !== undefined)
    for (const issue of validateRemoteContracts(manifests)) {
      const label = issue.kind === 'missing' ? '未注册' : '未声明'
      console.warn(
        `[RemoteContract] MOD "${issue.mod}" 函数 "${issue.functionName}" ${label}（manifest.remoteApi / codegen 与 remote 不一致）`,
      )
    }

    // consumes 校验：确保 manifest.consumes 中的能力由已加载的 MOD 提供
    const availableCaps = modRegistry.getAvailableCapabilities()
    for (const manifest of manifests) {
      if (!manifest.consumes?.length) continue
      for (const cap of manifest.consumes) {
        if (!availableCaps.has(cap)) {
          console.warn(
            `[ModLoader] MOD "${manifest.name}" consumes "${cap}" 但无已加载的 MOD 提供此能力`,
          )
        }
      }
    }
  }

  return errors
}

/**
 * 通知所有 MOD 执行 onLoad 钩子（吸收 Factorio on_load 设计）
 *
 * @param context - MOD 上下文
 * @returns 错误列表
 */
export async function invokeModOnLoad(context: ModContext): Promise<string[]> {
  const errors: string[] = []
  const order = modRegistry.getLoadOrder()

  for (const name of order) {
    try {
      const mod = await getModControlImporter(name)()
      const lifecycle = mod.lifecycle as ModLifecycleV2 | undefined

      const perModContext: ModContext = {
        ...context,
        getStorage: <T extends Record<string, unknown> = Record<string, unknown>>() =>
          createStorageNamespace<T>(name, context.storage),
      }

      if (lifecycle?.onLoad) {
        await lifecycle.onLoad(perModContext)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`MOD "${name}" onLoad 失败: ${msg}`)
    }
  }

  return errors
}

/** 扫描兼容性子目录 */
async function scanCompatibilityDirs(order: string[]): Promise<void> {
  for (const modName of order) {
    const compatMap = COMPAT_IMPORTERS[modName]
    if (!compatMap) continue

    for (const otherName of order) {
      if (modName === otherName) continue
      const importer = compatMap[otherName]
      if (!importer) continue

      try {
        const compat = await importer()
        if (typeof compat.applyCompatibility === 'function') {
          await compat.applyCompatibility()
        }
      } catch {
        // 兼容文件加载失败，静默跳过
      }
    }
  }
}

/**
 * 触发配置变更通知
 *
 * @param data - 变更数据
 * @param context - MOD 上下文
 */
export async function notifyConfigurationChanged(
  data: ConfigurationChangedData,
  context: ModContext,
): Promise<string[]> {
  const errors: string[] = []
  const order = modRegistry.getLoadOrder()

  for (const name of order) {
    try {
      const mod = await getModControlImporter(name)()
      const lifecycle = mod.lifecycle as ModLifecycleV2 | undefined
      if (lifecycle?.onConfigurationChanged) {
        await lifecycle.onConfigurationChanged(data)
      } else if (lifecycle?.onInit) {
        await lifecycle.onInit(context)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`MOD "${name}" onConfigurationChanged 失败: ${msg}`)
    }
  }

  return errors
}
