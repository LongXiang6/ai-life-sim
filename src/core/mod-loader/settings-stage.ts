/**
 * @module settings-stage.ts
 * @description Settings 阶段执行器 — 三回合配置声明/交叉修正/一致性校验
 * @mod core
 *
 * 吸收 Factorio Settings 阶段设计：
 *   Round 1 (settings.lua):        收集所有 MOD 的 declareSettings() 声明
 *   Round 2 (settings-updates.lua): 逐 MOD 调用 updateSettings() 交叉修正
 *   Round 3 (settings-final-fixes): 逐 MOD 调用 validateSettings() 全局校验
 *
 * 使用方式：
 *   在 mod-loader Phase 2 完成后、onInit 之前调用：
 *     const settingsResult = await runSettingsStage(manifests, getModImporter)
 *     if (!settingsResult.valid) { // 阻塞启动 }
 */

import type { ModLifecycleV3, ModSettingDeclaration } from '@/foundation'

/** Settings 阶段结果 */
export interface SettingsStageResult {
  valid: boolean
  errors: string[]
  /** 全局设置声明表（key = MOD 名称） */
  allSettings: Record<string, ModSettingDeclaration[]>
}

/**
 * 执行 Settings 阶段（三回合配置处理）
 *
 * @param order - MOD 加载顺序列表
 * @param getModImporter - 获取 MOD 动态 import 的函数
 * @returns Settings 阶段结果
 */
export async function runSettingsStage(
  order: string[],
  getModImporter: (name: string) => () => Promise<Record<string, unknown>>,
): Promise<SettingsStageResult> {
  const errors: string[] = []

  // === Round 1: 收集所有 MOD 的配置声明 (settings.lua) ===
  const allSettings: Record<string, ModSettingDeclaration[]> = {}
  for (const name of order) {
    try {
      const importer = getModImporter(name)
      const mod = await importer()
      const lifecycle = mod.lifecycle as ModLifecycleV3 | undefined
      if (lifecycle?.declareSettings) {
        const declared = lifecycle.declareSettings()
        // 校验声明格式
        for (const s of declared) {
          if (!s.key || !s.type) {
            errors.push(`[${name}] 设置项声明缺少 key 或 type`)
          }
        }
        allSettings[name] = declared
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`[${name}] declareSettings 失败: ${msg}`)
    }
  }

  // === Round 2: 逐 MOD 交叉修正 (settings-updates.lua) ===
  for (const name of order) {
    try {
      const importer = getModImporter(name)
      const mod = await importer()
      const lifecycle = mod.lifecycle as ModLifecycleV3 | undefined
      if (lifecycle?.updateSettings) {
        const updates = lifecycle.updateSettings(allSettings)
        // 将修正后的值写回（由 MOD 自身的 store 处理）
        // 引擎只负责调度，不直接修改 MOD 配置
        void updates
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`[${name}] updateSettings 失败: ${msg}`)
    }
  }

  // === Round 3: 全局一致性校验 (settings-final-fixes.lua) ===
  for (const name of order) {
    try {
      const importer = getModImporter(name)
      const mod = await importer()
      const lifecycle = mod.lifecycle as ModLifecycleV3 | undefined
      if (lifecycle?.validateSettings) {
        await lifecycle.validateSettings(allSettings)
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      errors.push(`[${name}] validateSettings 失败: ${msg}`)
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    allSettings,
  }
}
