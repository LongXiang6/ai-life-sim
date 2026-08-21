/**
 * Purpose: Load and validate the active MVP stage configuration.
 * Owner: mod-engine
 * Responsibility: Parse configured runtime and Prompt subsystem membership without owning subsystem behavior.
 *
 * @module mvp-stage-loader.ts
 * @description MVP 阶段策略配置加载器 —— 将硬编码的子系统白名单外部化为可配置 JSON
 * @mod mod-engine
 *
 * 职责：
 *   - 加载默认阶段配置（从 mvp-stages-config.default.json 静态导入）
 *   - Zod schema 校验确保配置数据完整性
 *   - 按 currentStage 解析当前阶段的运行时/提示/叙事写入子系统集合
 *   - 提供活动运行、Prompt 与结算可写子系统集合
 */

import defaultConfigJson from './mvp-stages-config.default.json'
import { z } from 'zod'

// ============================================================
// Zod Schema 定义
// ============================================================

const MvpStageSchema = z.object({
  description: z.string(),
  runtime: z.object({
    external: z.array(z.string()),
    engine: z.array(z.string()),
  }),
})

export const MvpStagesConfigSchema = z.object({
  currentStage: z.string(),
  stages: z.record(z.string(), MvpStageSchema),
})

// ============================================================
// 类型导出
// ============================================================

export type MvpStageConfig = z.infer<typeof MvpStageSchema>
export type MvpStagesConfig = z.infer<typeof MvpStagesConfigSchema>

// ============================================================
// 配置加载器
// ============================================================

export class MvpStageLoader {
  private config: MvpStagesConfig

  constructor() {
    const result = MvpStagesConfigSchema.safeParse(defaultConfigJson)
    if (!result.success) {
      const details = result.error.issues.map((issue) => (
        `${issue.path.join('.')}: ${issue.message}`
      )).join('; ')
      throw new Error(`[MvpStageConfig] 默认阶段配置校验失败: ${details}`)
    }
    this.config = result.data
    this.assertUniqueRuntimeIds()
  }

  private assertUniqueRuntimeIds(): void {
    for (const [stageName, stage] of Object.entries(this.config.stages)) {
      const stageSeen = new Set<string>()
      for (const [group, ids] of Object.entries(stage.runtime)) {
        const seen = new Set<string>()
        for (const id of ids) {
          if (seen.has(id)) {
            throw new Error(`[MvpStageConfig] ${stageName}.runtime.${group} 子系统重复: ${id}`)
          }
          seen.add(id)
          if (stageSeen.has(id)) {
            throw new Error(`[MvpStageConfig] ${stageName}.runtime 子系统跨组重复: ${id}`)
          }
          stageSeen.add(id)
        }
      }
    }
  }

  /** 当前阶段名 */
  getCurrentStage(): string {
    return this.config.currentStage
  }

  /** 当前阶段配置（阶段缺失时抛错，属于配置错误应尽早暴露） */
  getCurrentStageConfig(): MvpStageConfig {
    const stage = this.config.currentStage
    const stageConfig = this.config.stages[stage]
    if (!stageConfig) {
      throw new Error(`[MvpStageConfig] 未找到阶段配置: ${stage}`)
    }
    return stageConfig
  }

  /** 外部 MOD 运行时子系统集合 */
  getExternalRuntimeSubsystems(): Set<string> {
    return new Set(this.getExternalRuntimeSubsystemOrder())
  }

  getExternalRuntimeSubsystemOrder(): readonly string[] {
    return [...this.getCurrentStageConfig().runtime.external]
  }

  /** 引擎内部运行时子系统集合 */
  getEngineRuntimeSubsystems(): Set<string> {
    return new Set(this.getEngineRuntimeSubsystemOrder())
  }

  getEngineRuntimeSubsystemOrder(): readonly string[] {
    return [...this.getCurrentStageConfig().runtime.engine]
  }

  /** 允许进入 Prompt 的子系统集合（external + engine 合并） */
  getPromptSubsystems(): Set<string> {
    const stage = this.getCurrentStageConfig()
    return new Set([...stage.runtime.external, ...stage.runtime.engine])
  }

}

/** 全局单例 */
export const mvpStageLoader = new MvpStageLoader()
