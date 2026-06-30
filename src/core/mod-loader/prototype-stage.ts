/**
 * @module prototype-stage.ts
 * @description Prototype 阶段执行器 — 三回合 manifest / 子系统 / 能力校验
 * @mod core
 *
 * 吸收 Factorio data.lua 三回合设计（无游戏实例时的原型构建）：
 *   Round 1: 收集 provides 声明，检测重复
 *   Round 2: manifest.subsystems ↔ MOD_SUBSYSTEM_IMPORTERS 可达性
 *   Round 3: consumes 能力解析
 *
 * 在 Settings 阶段之后、迁移/onInit 之前调用。
 */

import type { ModManifest } from '@/foundation'

import { MOD_SUBSYSTEM_IMPORTERS } from './mod-subsystem-importers.generated'

/** Prototype 阶段结果 */
export interface PrototypeStageResult {
  valid: boolean
  errors: string[]
}

/**
 * @param className - 子系统类名
 * @param exports - subsystems barrel 导出
 */
function subsystemExportExists(
  className: string,
  exports: Record<string, unknown>,
): boolean {
  const camel = className.charAt(0).toLowerCase() + className.slice(1)
  if (exports[className] !== undefined) return true
  if (exports[camel] !== undefined) return true
  return false
}

/**
 * 执行 Prototype 阶段（三回合）
 *
 * @param order - MOD 加载顺序
 * @param getManifest - 按名称获取 manifest
 */
export async function runPrototypeStage(
  order: string[],
  getManifest: (name: string) => ModManifest | undefined,
): Promise<PrototypeStageResult> {
  const errors: string[] = []
  const allProvides = new Map<string, string>()

  // Round 1: 收集 provides，检测重复
  for (const name of order) {
    const manifest = getManifest(name)
    if (!manifest) continue
    for (const cap of manifest.provides) {
      const existing = allProvides.get(cap)
      if (existing && existing !== name) {
        errors.push(`[prototype:R1] 能力 "${cap}" 重复声明: ${existing} 与 ${name}`)
      }
      allProvides.set(cap, name)
    }
  }

  // Round 2: 子系统 barrel 可达性（mod-engine 内部子系统由 engine-subsystems.generated 管理）
  for (const name of order) {
    const manifest = getManifest(name)
    if (!manifest?.subsystems?.length || name === 'mod-engine') continue

    const importer = MOD_SUBSYSTEM_IMPORTERS[name]
    if (!importer) {
      errors.push(`[prototype:R2] ${name} 声明 subsystems 但无 MOD_SUBSYSTEM_IMPORTERS 条目`)
      continue
    }

    try {
      const modExports = await importer()
      for (const className of manifest.subsystems) {
        if (className === 'OrchestratorSystem') continue
        if (!subsystemExportExists(className, modExports)) {
          errors.push(`[prototype:R2] ${name}/${className} 未在 subsystems barrel 导出`)
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`[prototype:R2] ${name} subsystems import 失败: ${msg}`)
    }
  }

  // Round 3: consumes 解析
  for (const name of order) {
    const manifest = getManifest(name)
    if (!manifest) continue
    for (const raw of manifest.consumes) {
      const cap = raw.replace(/^[!~?]/, '')
      if (!allProvides.has(cap)) {
        errors.push(`[prototype:R3] ${name} consumes "${cap}" 无 provider`)
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  }
}
