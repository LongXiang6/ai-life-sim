/**
 * @module register-subsystems.ts
 * @description 按 manifest 声明将各 MOD 子系统注册到 orchestrator
 * @mod mod-engine
 */

import type { ISubSystem, ModManifest } from '@/foundation'

import { MOD_SUBSYSTEM_IMPORTERS } from '@/core/mod-loader/mod-subsystem-importers.generated'
import { SUBSYSTEM_SINGLETON_ALIASES } from './subsystem-aliases.generated'
import { orchestrator } from '../subsystems/orchestrator-system'

function isSubSystem(value: unknown): value is ISubSystem {
  return (
    typeof value === 'object'
    && value !== null
    && 'id' in value
    && 'collectState' in value
    && typeof (value as ISubSystem).collectState === 'function'
  )
}

function resolveSubsystemInstance(
  modExports: Record<string, unknown>,
  className: string,
): ISubSystem | null {
  const alias = SUBSYSTEM_SINGLETON_ALIASES[className]
  if (alias && isSubSystem(modExports[alias])) {
    return modExports[alias]
  }

  const camelCase = className.charAt(0).toLowerCase() + className.slice(1)
  if (isSubSystem(modExports[camelCase])) {
    return modExports[camelCase]
  }

  const ClassCtor = modExports[className]
  if (typeof ClassCtor === 'function') {
    return new (ClassCtor as new () => ISubSystem)()
  }

  return null
}

function resolveModImporter(modName: string): (() => Promise<Record<string, unknown>>) | undefined {
  return MOD_SUBSYSTEM_IMPORTERS[modName] ?? undefined
}

/** 注册所有已加载 MOD 的业务子系统（跳过 mod-engine 内部子系统）

 * @param manifests - 已按 V2 依赖深度排序的 manifest 列表（由 modRegistry.getLoadOrder() 提供）
 * @returns 成功注册的子系统数量
 */
export async function registerAllSubsystems(manifests: ModManifest[]): Promise<number> {
  orchestrator.clearExternalSubsystems()
  orchestrator.setManifests(manifests)

  let registered = 0

  for (const manifest of manifests) {
    if (manifest.name === 'mod-engine') continue
    if (!manifest.subsystems?.length) continue

    const importer = resolveModImporter(manifest.name)
    if (!importer) {
      console.warn(`[register-subsystems] 无 import 映射: ${manifest.name}`)
      continue
    }

    const modExports = await importer()

    for (const className of manifest.subsystems) {
      if (className === 'OrchestratorSystem') continue

      const instance = resolveSubsystemInstance(modExports, className)
      if (!instance) {
        console.warn(`[register-subsystems] 未找到子系统 ${manifest.name}/${className}`)
        continue
      }

      orchestrator.registerSubsystem(instance)
      registered++
    }
  }

  return registered
}
