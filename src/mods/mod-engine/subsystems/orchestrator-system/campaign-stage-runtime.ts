/**
 * Purpose: Load, cache, and execute declarative narrative campaign stages.
 * Owner: mod-engine
 * Responsibility: Own campaign-stage cache and execution sequencing without owning round business state.
 */

import { EXECUTION_FLOWS } from '@/core'
import {
  createExecutionOutcomeCodes,
  executionSequenceError,
  runExecutionSequence,
} from '@/foundation'
import { logger } from '@/core/logger/client-logger'
import {
  recordExecutionSequenceResult,
} from '@/core/logger/development-system-diagnostic'
import type {
  AIModelConfig,
  NarrativeStage,
  PromptTemplate,
  RoundContext,
} from '@/foundation'
import type { NarrativeDiagnosticPhase } from '@/core/logger/narrative-round-diagnostic'

interface CampaignStageExecutionRuntime {
  lifeRunId: string
  totalRounds: number
  pushDiagnosticPhase: (phase: NarrativeDiagnosticPhase) => void
}

export class CampaignStageRuntime {
  private _stages: NarrativeStage[] | null = null
  private _stagesCacheKey: string | null = null

  private buildCampaignStagesCacheKey(
    aiConfig: AIModelConfig,
    promptTemplate: PromptTemplate,
    sessionId: string | undefined,
    modName: string,
    campaignName: string,
  ): string {
    return JSON.stringify({
      modName,
      campaignName,
      sessionId,
      aiConfig,
      prompt: {
        name: promptTemplate.name,
        version: promptTemplate.version,
        systemPrompt: promptTemplate.systemPrompt,
        userPromptTemplate: promptTemplate.userPromptTemplate,
        variables: promptTemplate.variables,
        outputFormat: promptTemplate.outputFormat,
      },
    })
  }

  /**
   * 从 MOD 的 campaigns/ 目录加载叙事阶段定义
   *
   * 吸收 Factorio campaigns/ 设计：
   *   叙事配置与引擎逻辑分离，orchestrator 读取 campaign 配置驱动叙事。
   *
   * @param aiConfig - AI 模型配置（传递给 stage 闭包）
   * @param promptTemplate - Prompt 模板（传递给 stage 闭包）
   * @param sessionId - 会话 ID（传递给 stage 闭包）
   * @param modName - MOD 名称（默认 'mod-engine'）
   * @param campaignName - campaign 名称（默认 'default'）
   */
  async load(
    aiConfig: AIModelConfig,
    promptTemplate: PromptTemplate,
    sessionId?: string,
    modName = 'mod-engine',
    campaignName = 'default',
  ): Promise<NarrativeStage[]> {
    const cacheKey = this.buildCampaignStagesCacheKey(
      aiConfig,
      promptTemplate,
      sessionId,
      modName,
      campaignName,
    )
    if (this._stages && this._stagesCacheKey === cacheKey) return this._stages

    try {
      const campaign = await import(`@/mods/${modName}/campaigns/${campaignName}`) as {
        loadStages?: (aiConfig: AIModelConfig, promptTemplate: PromptTemplate, sessionId?: string) => NarrativeStage[]
        stages?: NarrativeStage[]
      }
      const stages = campaign.loadStages?.(aiConfig, promptTemplate, sessionId) ?? campaign.stages ?? []
      this._stages = stages
      this._stagesCacheKey = cacheKey
      return stages
    } catch {
      // MOD 没有 campaigns 目录 → 使用空数组（报错，不静默回退）
      console.warn('[Orchestrator] 未找到 campaign 定义，无法执行阶段机')
      this._stages = []
      this._stagesCacheKey = cacheKey
      return []
    }
  }

  /**
   * 执行叙事阶段机
   *
   * 按阶段声明的执行图逐阶段执行。每阶段支持：
   *   - onEnter: 进入阶段时执行一次
   *   - onUpdate: 每轮执行
   *   - shouldProceed: 判断是否可前进（返回 true → 进入下一阶段）
   *   - onExit: 离开阶段时执行一次
   *   - maxRounds: 阶段执行次数上限，超限进入失败终态
   *
   * 吸收 Factorio Story Script 的 init→update→condition→action 模型。
   */
  async run(
    stages: NarrativeStage[],
    context: RoundContext,
    runtime: CampaignStageExecutionRuntime,
  ): Promise<void> {
    if (stages.length === 0) return
    const flow = EXECUTION_FLOWS.narrativeRound
    const executionRoundSequence = (context.roundSequence ?? runtime.totalRounds) + 1

    const nodes = stages.map((stage, index) => ({
      id: stage.name,
      owner: stage.owner,
      failureTarget: stage.failureTarget,
      phase: stage.phase,
      dependsOn: stage.dependsOn,
      order: stage.order,
      parallelGroup: stage.parallelGroup,
      outcomes: createExecutionOutcomeCodes(flow.flowId, stage.name),
      run: async (stageContext: RoundContext) => {
        let roundCount = 0
        const stageStartedAt = performance.now()
        let failurePoint: 'onEnter' | 'onUpdate' | 'shouldProceed' | 'onExit' | 'maxRounds' | undefined
        logger.debug('orchestrator-stage', 'stage-enter', {
          stage: stage.name,
          index,
          total: stages.length,
          round: runtime.totalRounds,
        })

        try {
          failurePoint = 'onEnter'
          await stage.onEnter?.(stageContext)

          while (true) {
            roundCount += 1
            const maxRounds = stage.maxRounds ?? 100
            if (roundCount > maxRounds) {
              failurePoint = 'maxRounds'
              throw new Error(`阶段 "${stage.name}" 超过 maxRounds=${maxRounds}`)
            }

            failurePoint = 'onUpdate'
            await stage.onUpdate?.(stageContext)

            failurePoint = 'shouldProceed'
            const shouldProceed = stage.shouldProceed
              ? await stage.shouldProceed(stageContext)
              : true
            if (shouldProceed) break
          }

          failurePoint = 'onExit'
          await stage.onExit?.(stageContext)
          logger.debug('orchestrator-stage', 'stage-exit', {
            stage: stage.name,
            index,
            rounds: roundCount,
          })
          runtime.pushDiagnosticPhase({
            name: stage.name,
            status: 'completed',
            durationMs: Math.max(0, Math.round(performance.now() - stageStartedAt)),
            details: { index, iterations: roundCount },
          })
          return { status: 'succeeded' as const }
        } catch (error) {
          const stageError: NarrativeDiagnosticPhase['error'] = {
            name: error instanceof Error ? error.name : undefined,
            message: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
          }
          logger.error('orchestrator-stage', 'stage-failed', error)
          runtime.pushDiagnosticPhase({
            name: stage.name,
            status: 'failed',
            durationMs: Math.max(0, Math.round(performance.now() - stageStartedAt)),
            details: { index, iterations: roundCount, failurePoint },
            error: stageError,
          })
          throw error
        }
      },
    }))

    const result = await runExecutionSequence({
      flow,
      executionId: `${flow.flowId}:${runtime.lifeRunId}:${executionRoundSequence}:real`,
      context,
      nodes,
    })
    recordExecutionSequenceResult(result, {
      lifeRunId: runtime.lifeRunId,
      round: executionRoundSequence,
    })
    if (result.status !== 'succeeded') {
      throw executionSequenceError(result)
    }
  }
}
