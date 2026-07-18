/**
 * @module mvp-stage-loader.ts
 * @description MVP 阶段策略配置加载器 —— 将硬编码的子系统白名单外部化为可配置 JSON
 * @mod mod-engine
 *
 * 职责：
 *   - 加载默认阶段配置（从 mvp-stages-config.default.json 静态导入）
 *   - Zod schema 校验确保配置数据完整性
 *   - 按 currentStage 解析当前阶段的运行时/提示/叙事写入子系统集合
 *   - 集中提供 allowedSubsystemsText，并从字段契约生成 subsystemGuide
 */

import defaultConfigJson from './mvp-stages-config.default.json'
import { z } from 'zod'
import { buildSubsystemGuide } from './subsystem-field-registry'

// ============================================================
// Zod Schema 定义
// ============================================================

const MvpStageSchema = z.object({
  description: z.string(),
  runtime: z.object({
    external: z.array(z.string()),
    engine: z.array(z.string()),
  }),
  narrativeChange: z.array(z.string()),
  allowedSubsystemsText: z.string(),
  /** @deprecated 字段指南从 subsystem-field-registry.ts 契约派生；旧配置保留兼容但不再读取 */
  subsystemGuide: z.string().optional(),
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
      console.error(
        '[MvpStageConfig] 默认阶段配置校验失败:',
        result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`),
      )
      // 降级：强制类型转换（不阻塞启动）
      this.config = defaultConfigJson as MvpStagesConfig
    } else {
      this.config = result.data
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
    return new Set(this.getCurrentStageConfig().runtime.external)
  }

  /** 引擎内部运行时子系统集合 */
  getEngineRuntimeSubsystems(): Set<string> {
    return new Set(this.getCurrentStageConfig().runtime.engine)
  }

  /** 允许进入 Prompt 的子系统集合（external + engine 合并） */
  getPromptSubsystems(): Set<string> {
    const stage = this.getCurrentStageConfig()
    return new Set([...stage.runtime.external, ...stage.runtime.engine])
  }

  /** 允许叙事 AI 写入 changes 的子系统集合 */
  getNarrativeChangeSubsystems(): Set<string> {
    return new Set(this.getCurrentStageConfig().narrativeChange)
  }

  /** 可变更子系统提示文本 */
  getAllowedSubsystemsText(): string {
    return this.getCurrentStageConfig().allowedSubsystemsText
  }

  /** 子系统变更字段指南文本 */
  getSubsystemGuide(): string {
    const stage = this.getCurrentStageConfig()
    const guide = buildSubsystemGuide(stage.narrativeChange)
    return [
      guide,
      '---',
      'MVP 提交规则：',
      '  仅当叙事确实改变基础属性、寿命、气运或善恶时写状态变更；普通剧情省略整个字段。',
      '  属性变更示例：{"id":"character-base","description":"勤修苦练，体魄增强","changes":{"physiqueDelta":2}}',
      '  年龄由时间推进与起始年龄派生，禁止写 lifespan.age；只有明确减寿/增寿事件才写 lifespanDelta。',
      '  未列入上方字段指南的模拟系统当前延后，禁止写入。',
    ].join('\n')
  }
}

/** 全局单例 */
export const mvpStageLoader = new MvpStageLoader()
