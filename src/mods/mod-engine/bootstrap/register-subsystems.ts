/**
 * @module register-subsystems.ts
 * @description 按 manifest 声明将各 MOD 子系统注册到 orchestrator
 * @mod mod-engine
 */

import type { ISubSystem, ModManifest } from '@/foundation'

import { MOD_SUBSYSTEM_IMPORTERS } from '@/core/mod-loader/mod-subsystem-importers.generated'
import { SUBSYSTEM_SINGLETON_ALIASES } from './subsystem-aliases.generated'
import { orchestrator } from '../subsystems/orchestrator-system'
import {
  MVP_EXTERNAL_RUNTIME_SUBSYSTEM_ORDER,
  isMvpRuntimeSubsystem,
} from '../helpers/mvp-runtime-policy'

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

  const getterName = `get${className}`
  const getter = modExports[getterName]
  if (typeof getter === 'function') {
    const instance = (getter as () => unknown)()
    if (isSubSystem(instance)) return instance
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
  const resolved = new Map<string, ISubSystem>()

  for (const manifest of manifests) {
    if (manifest.name === 'mod-engine') continue
    if (!manifest.subsystems?.length) continue

    const importer = resolveModImporter(manifest.name)
    if (!importer) {
      throw Error(`[register-subsystems] 无 import 映射: ${manifest.name}`)
    }

    const modExports = await importer()

    for (const className of manifest.subsystems) {
      if (className === 'OrchestratorSystem') continue

      const instance = resolveSubsystemInstance(modExports, className)
      if (!instance) {
        throw Error(`[register-subsystems] 未找到子系统 ${manifest.name}/${className}`)
      }
      if (!isMvpRuntimeSubsystem(instance.id)) {
        continue
      }

      const existing = resolved.get(instance.id)
      if (existing) {
        throw Error(
          `[register-subsystems] 子系统标识重复: ${instance.id} (${existing.mod}, ${instance.mod})`,
        )
      }
      resolved.set(instance.id, instance)
    }
  }

  const missing = MVP_EXTERNAL_RUNTIME_SUBSYSTEM_ORDER.filter((id) => !resolved.has(id))
  if (missing.length > 0) {
    throw Error(`[register-subsystems] 活动子系统未完整解析: ${missing.join(', ')}`)
  }

  orchestrator.clearExternalSubsystems()
  orchestrator.setManifests(manifests)
  for (const id of MVP_EXTERNAL_RUNTIME_SUBSYSTEM_ORDER) {
    orchestrator.registerSubsystem(resolved.get(id)!)
  }

  return MVP_EXTERNAL_RUNTIME_SUBSYSTEM_ORDER.length
}
