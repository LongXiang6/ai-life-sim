/**
 * @module campaigns/default/index.ts
 * @description 默认叙事 Campaign — 11 阶段管线定义（闭包实现）
 * @mod mod-engine
 *
 * 吸收 Factorio campaigns/ + Story Script 设计：
 *   - 叙事配置与引擎逻辑分离
 *   - 每阶段映射到 orchestrator 的管线步骤
 *   - 阶段机驱动（onEnter → onUpdate/shouldProceed 循环 → onExit）
 *   - maxRounds 自动防死循环
 *
 * 未来可扩展为多个 campaigns（如 xianxia/、scifi/），
 * orchestrator 根据世界设定自动选择对应 campaign。
 *
 * 运行时参数通过 loadStages() 传入，闭包捕获。
 */

import type { NarrativeStage, RoundContext, AIModelConfig, PromptTemplate } from '@/foundation'
import { eventBus, callAIWithPromptTemplate, callAIDegraded, buildSegmentedPrompt, getNarrativeUserSegments, recordRoundCacheMetrics, parseAIJSON } from '@/core'
import { memoryLifecycle } from '../../subsystems/memory-lifecycle-system'
import { buildEventInjectionText } from '../../helpers/event-lifecycle-tracker'
import { useSettingsStore } from '@/mods/mod-settings'
import { useEngineStore } from '../../store'
import { orchestrator } from '../../subsystems/orchestrator-system'
import { runImmersionWarmupPass } from '../../helpers/immersion-two-pass'
import { DEFAULT_WORD_COUNT_TARGET } from '../../constants/narrative-config'
import {
  canContinueWithNarrativeBody,
  buildNarrativeRepairInstruction,
  inspectNarrativeResponseQuality,
  preserveNarrativeBodyAndSummary,
} from '../../helpers/narrative-response-quality'
import {
  checkNarrativeRepetition,
  chooseNarrativeRepetitionRepair,
  buildRepetitionRepairInstruction,
  inspectPrefetchedNarrativeRepetition,
} from '../../helpers/narrative-repetition-detection'
import { extractTaggedMetaEnvelope } from '../../helpers/tagged-meta-envelope'
import { buildBranchIntentInstruction } from '../../helpers/branch-intent-resolution'
import { NARRATIVE_REPAIR_SERVER_PROMPT_ASSET_ID } from '../../prompts/narrative-prompt'
import {
  narrativeBranchRepairOutputSchema,
  narrativeBranchRepairPrompt,
} from '../../prompts/narrative-branch-repair-prompt'
import {
  narrativeRepetitionAuditPrompt,
  narrativeRepetitionRepairPrompt,
  parseNarrativeRepetitionAuditOutput,
  parseNarrativeRepetitionRepairOutput,
} from '../../prompts/narrative-repetition-repair-prompt'
import type {
  NarrativeBranchRepairOutput,
  NarrativeRepetitionRepairCandidate,
} from '../../types'
import {
  compileNarrativeDynamicComponents,
  createNarrativeRepairComponent,
} from '../../prompts/narrative-prompt-components'
import { isNarrativeSafetyRejectedError } from '../../helpers/narrative-safety'

/** 阶段运行时上下文（扩展 RoundContext，携带本轮调用参数 + 阶段间临时数据） */
export interface StageRuntimeContext extends RoundContext {
  _aiConfig: AIModelConfig
  _promptTemplate: PromptTemplate
  _sessionId?: string
  _eventInjectionText?: string
  _crossDomainTriggered?: boolean
  _promptContext?: ReturnType<typeof orchestrator.assemblePromptContext>
  _warmupAck?: string
  _fullContent?: string
  /** 完整正文先提交后，只生成分支标题与选项的后台补救。 */
  _forcedBranchRepair?: Promise<NarrativeBranchRepairOutput | undefined>
  _forcedBranchRepairGeneration?: number
  _forcedBranchRepairOwnerToken?: string
  _forcedBranchRepairSourceNarrative?: string
  _forcedBranchRepairRoundToken?: string
  /** 重复正文的后台候选；只合并到已提交历史条目，不阻塞本轮交付。 */
  _repetitionRepair?: Promise<NarrativeRepetitionRepairCandidate | undefined>
  /** 启动后台候选时捕获的人生代际；读档/重置后不得把旧请求合并回来。 */
  _repetitionRepairGeneration?: number
  _repetitionRepairOwnerToken?: string
  _repetitionRepairSourceContent?: string
  _repetitionRepairRoundToken?: string
  _roundResult?: ReturnType<typeof orchestrator.handleNarrativeResponse>
}

/**
 * 加载默认 campaign 的叙事阶段（闭包捕获运行时参数）
 *
 * @param aiConfig - AI 模型配置
 * @param promptTemplate - Prompt 模板
 * @param sessionId - 会话 ID
 * @returns 叙事阶段数组
 */
export function loadStages(
  aiConfig: AIModelConfig,
  promptTemplate: PromptTemplate,
  sessionId?: string,
): NarrativeStage[] {
  const stages: NarrativeStage[] = [
    // === 阶段 1: 推进时间 ===
    {
      name: 'advance-time',
      onEnter: (_ctx) => {
        if (!orchestrator.isPreviewExecution()) {
          eventBus.emit('mod-engine:round-start', orchestrator.getRound())
        }
        orchestrator.advanceTime()
      },
      maxRounds: 1,
    },

    // === 阶段 3: 本地模拟推进（所有子系统的纯规则推演） ===
    {
      name: 'subsystem-advance',
      onEnter: () => {
        if (orchestrator.isPreviewExecution()) return
        orchestrator.advanceAllSubsystems()
      },
      maxRounds: 1,
    },

    // === 阶段 4: 三回合收集子系统状态 ===
    {
      name: 'collect-states',
      onEnter: () => {
        orchestrator.collectAllSubsystemStates()
      },
      maxRounds: 1,
    },

    // === 阶段 5: 事件生命周期检测 ===
    {
      name: 'event-lifecycle',
      onEnter: (_ctx) => {
        const ctx = _ctx as StageRuntimeContext
        const states = orchestrator.getDetectionStates()
        const lifecycle = orchestrator.getEventLifecycle()
        const totalRounds = orchestrator.getState().totalRounds
        const { eventInjectionText, newLifecycle } = buildEventInjectionText(
          states,
          lifecycle,
          totalRounds,
        )
        orchestrator.setEventLifecycle(newLifecycle)
        ctx._eventInjectionText = eventInjectionText || undefined
      },
      maxRounds: 1,
    },

    // === 阶段 6: 跨域联动 ===
    {
      name: 'cross-domain',
      onEnter: async (_ctx) => {
        const ctx = _ctx as StageRuntimeContext
        if (orchestrator.isPreviewExecution()) {
          ctx._crossDomainTriggered = false
          return
        }
        const hadMacroEvents = !!ctx._eventInjectionText
        await orchestrator.executeCrossDomainLinkage()
        ctx._crossDomainTriggered = true

        orchestrator.collectAllSubsystemStates(false)

        if (hadMacroEvents) {
          const reDetect = buildEventInjectionText(
            orchestrator.getDetectionStates(),
            orchestrator.getEventLifecycle(),
            orchestrator.getState().totalRounds,
          )
          orchestrator.setEventLifecycle(reDetect.newLifecycle)
          if (reDetect.eventInjectionText) {
            ctx._eventInjectionText = [ctx._eventInjectionText, reDetect.eventInjectionText]
              .filter(Boolean)
              .join('\n')
          }
        }
      },
      maxRounds: 1,
    },

    // === 阶段 7: 组装富 PromptContext ===
    {
      name: 'assemble-prompt',
      onEnter: (_ctx) => {
        const ctx = _ctx as StageRuntimeContext
        ctx._promptContext = orchestrator.assemblePromptContext(ctx._eventInjectionText)
      },
      maxRounds: 1,
    },

    // === 阶段 8: AI 叙事（流式 + 降级链；可选 Two-pass 记忆预热） ===
    {
      name: 'ai-narration',
      onUpdate: async (_ctx) => {
        const ctx = _ctx as StageRuntimeContext
        if (!ctx._promptContext) return

        const wordCountTarget = useSettingsStore.getState().wordCountTarget
          ?? DEFAULT_WORD_COUNT_TARGET
        const focusedIntent = orchestrator.getFocusedBranchIntent()
        const expectedIntentId = focusedIntent?.intentId ?? null
        const requireBranch = useEngineStore.getState().forceBranchNext
        const focusedIntentRepairInstruction = focusedIntent
          ? buildBranchIntentInstruction(
              focusedIntent,
              orchestrator.getActiveBranchIntents().filter(
                (intent) => intent.intentId !== focusedIntent.intentId,
              ),
            )
          : undefined

        const prefetched = orchestrator.consumePrefetchedNarrative()
        if (prefetched) {
          orchestrator.assertNarrativeContentSafe(prefetched)
          const prefetchedQuality = inspectNarrativeResponseQuality(
            prefetched,
            wordCountTarget,
            expectedIntentId,
            requireBranch,
          )
          if (
            prefetchedQuality.valid
            || canContinueWithNarrativeBody(prefetchedQuality, expectedIntentId, requireBranch)
          ) {
            const candidateContent = prefetchedQuality.valid
              ? prefetched
              : preserveNarrativeBodyAndSummary(prefetched)
            const candidateNarrative = extractTaggedMetaEnvelope(candidateContent)?.narrative
              ?? candidateContent
            const recentHistory = orchestrator.getState().narrativeHistory
              .slice(-6)
              .map((entry) => entry.text)
            const prefetchDecision = inspectPrefetchedNarrativeRepetition(
              candidateNarrative,
              recentHistory,
            )
            if (prefetchDecision.canConsume) {
              orchestrator.resetCurrentNarrative()
              if (!orchestrator.isPreviewExecution()) {
                useEngineStore.setState({ streamingNarrative: '' })
              }
              ctx._fullContent = candidateContent
              if (!prefetchedQuality.valid) {
                console.info(
                  '[Orchestrator] 预生成命运意图 META 未完成；消费完整正文，意图保持待处理:',
                  prefetchedQuality.reason,
                )
              }
              return
            }
            console.warn(
              '[Orchestrator] 预生成叙事命中重复或阶段回退，已丢弃缓存并改为实时生成:',
              prefetchDecision.repetition.kind,
            )
          } else {
            console.info(
              '[Orchestrator] 预生成叙事未通过主推进复验，已改为实时生成:',
              prefetchedQuality.reason,
            )
          }
        }

        const { customKey, provider, customUrl, customModel, storySeed } = useSettingsStore.getState()
        const model = customModel || aiConfig.model
        const normalizedStorySeed = storySeed.trim() || undefined
        const routeOpts = { providerId: provider, customBaseUrl: customUrl || undefined, customModel: model }
        const repairPromptTemplate = {
          ...promptTemplate,
          serverPromptAssetId: NARRATIVE_REPAIR_SERVER_PROMPT_ASSET_ID,
        }

        const baseSegments = buildSegmentedPrompt(promptTemplate, ctx._promptContext)

        // Pass 1: 沉浸模式记忆预热（IMMERSION_TWO_PASS_ENABLED 时，共享 stable 前缀）
        ctx._warmupAck = await runImmersionWarmupPass(
          ctx._promptContext,
          promptTemplate.systemPrompt,
          {
            config: { ...aiConfig, model },
            sessionId,
            signal: orchestrator.getPreviewAbortSignal(),
            apiKey: customKey || undefined,
            serverPromptAssetId: promptTemplate.serverPromptAssetId,
            ...routeOpts,
            stableUserPrefix: baseSegments.stablePrefix,
            logContext: {
              round: orchestrator.getState().totalRounds,
              age: Number(ctx._promptContext.characterStatusView.年龄),
              strategy: baseSegments.strategy,
              callKind: 'immersion-warmup',
              pool: 'narrative',
              model,
              sessionId,
            },
          },
        )

        const promptContextForNarration = ctx._warmupAck
          ? {
              ...ctx._promptContext,
              worldCustomizeText: [
                ctx._promptContext.worldCustomizeText,
                `【记忆预热确认】${ctx._warmupAck}`,
              ].filter(Boolean).join('\n'),
            }
          : ctx._promptContext

        const segments = ctx._warmupAck
          ? buildSegmentedPrompt(promptTemplate, promptContextForNarration)
          : baseSegments
        const fallbackNarrative = orchestrator.buildFallbackNarrative()
        orchestrator.resetCurrentNarrative()
        if (!orchestrator.isPreviewExecution()) {
          useEngineStore.setState({ streamingNarrative: '' })
        }

        const useStream = !orchestrator.isPreviewExecution()
          && useSettingsStore.getState().streamingMode === 'stream'

        const roundInfo = orchestrator.getState().round
        const logContext = {
          round: orchestrator.getState().totalRounds,
          age: Number(ctx._promptContext.characterStatusView.年龄) || roundInfo.year,
          era: ctx._promptContext.currentTime ?? `${roundInfo.eraName}${roundInfo.eraYear}年`,
          strategy: segments.strategy,
          callKind: 'narrative-main',
          pool: 'narrative',
          model,
          sessionId,
        }

        const streamOpts = {
          config: { ...aiConfig, model },
          pool: 'narrative' as const,
          strictSchema: true,
          jsonMode: false,
          sessionId,
          signal: orchestrator.getPreviewAbortSignal(),
          apiKey: customKey || undefined,
          serverPromptAssetId: promptTemplate.serverPromptAssetId,
          logContext,
          ...routeOpts,
          ...(normalizedStorySeed ? { storySeed: normalizedStorySeed } : {}),
          ...(useStream
            ? {
                onChunk: (chunk: string) => {
                  orchestrator.appendNarrativeChunk(chunk)
                },
              }
            : {}),
        }

        try {
          if (useStream) {
            if (segments.strategy === 'S3' && segments.messages?.length) {
              ctx._fullContent = await callAIWithPromptTemplate(
                promptTemplate,
                segments.full,
                {
                  streaming: true,
                  fallbackText: fallbackNarrative,
                  ...streamOpts,
                  apiKey: customKey || undefined,
                  messages: segments.messages,
                },
              )
            } else {
              ctx._fullContent = await callAIWithPromptTemplate(
                promptTemplate,
                segments.full,
                {
                  streaming: true,
                  fallbackText: fallbackNarrative,
                  ...streamOpts,
                  apiKey: customKey || undefined,
                  userSegments: getNarrativeUserSegments(segments),
                },
              )
            }
          } else if (segments.strategy === 'S3' && segments.messages?.length) {
            ctx._fullContent = await callAIDegraded(
              segments.messages,
              fallbackNarrative,
              streamOpts,
            )
          } else {
            ctx._fullContent = await callAIWithPromptTemplate(
              promptTemplate,
              segments.full,
              {
                ...streamOpts,
                userSegments: getNarrativeUserSegments(segments),
              },
            )
            if (!ctx._fullContent?.trim()) {
              ctx._fullContent = fallbackNarrative
            }
          }

          orchestrator.assertNarrativeContentSafe(ctx._fullContent ?? '')

          const initialQuality = inspectNarrativeResponseQuality(
            ctx._fullContent ?? '',
            wordCountTarget,
            expectedIntentId,
            requireBranch,
          )
          if (initialQuality.dataAdvisory) {
            console.info('[Orchestrator]', initialQuality.dataAdvisory)
          }

          const runTargetedRepair = async (
            quality: ReturnType<typeof inspectNarrativeResponseQuality>,
            previousContent: string,
            finalAttempt: boolean,
          ): Promise<string> => {
            const repairInstruction = compileNarrativeDynamicComponents([
              createNarrativeRepairComponent(
                [
                  buildNarrativeRepairInstruction(
                    quality,
                    wordCountTarget,
                    expectedIntentId,
                    requireBranch,
                  ),
                  ...(focusedIntentRepairInstruction ? [focusedIntentRepairInstruction] : []),
                  ...(finalAttempt
                    ? ['这是最后一次协议修复机会：只修复信封和条件数据，保留上一版全部已成立剧情事实，不要解释。']
                    : []),
                ].join('\n'),
              ),
            ]) ?? ''
            if (useStream) {
              orchestrator.resetCurrentNarrative()
              useEngineStore.setState({ streamingNarrative: '' })
            }

            const repairOptions = {
              ...streamOpts,
              onChunk: undefined,
              logContext: {
                ...streamOpts.logContext,
                callKind: 'narrative-format-repair',
              },
            }

            const repaired = await callAIWithPromptTemplate(
              repairPromptTemplate,
              `${repairInstruction}\n\n【上一版完整输出；唯一剧情事实来源】\n${previousContent}`,
              repairOptions,
            )
            orchestrator.assertNarrativeContentSafe(repaired)
            return repaired
          }

          const repairForcedBranchInBackground = async (
            previousContent: string,
            generation: number,
          ): Promise<NarrativeBranchRepairOutput | undefined> => {
            if (generation !== orchestrator.getLifeGeneration()) return undefined
            const committedNarrative = extractTaggedMetaEnvelope(previousContent)?.narrative
              ?? previousContent.trim()
            const rawResult = await callAIWithPromptTemplate(
              narrativeBranchRepairPrompt,
              [
                '【已经提交的完整正文；唯一剧情事实来源】',
                committedNarrative,
                '【任务】玩家已明确要求此处出现命运分支。只提炼标题和二至四个可立即选择的行动，不续写正文。',
              ].join('\n'),
              {
                config: { ...aiConfig, model },
                pool: 'narrative',
                sessionId,
                signal: orchestrator.getPreviewAbortSignal(),
                apiKey: customKey || undefined,
                strictSchema: true,
                overrideMaxTokens: 640,
                overrideTemperature: 0.3,
                logContext: {
                  ...logContext,
                  callKind: 'narrative-branch-repair',
                },
                ...routeOpts,
              },
            )
            const validated = narrativeBranchRepairOutputSchema.safeParse(
              parseAIJSON(rawResult),
            )
            if (generation !== orchestrator.getLifeGeneration()) return undefined
            return validated.success ? validated.data : undefined
          }

          const repairRepetitiveNarrativeInBackground = async (
            previousContent: string,
            repetitionResult: ReturnType<typeof checkNarrativeRepetition>,
            recentHistory: string[],
            generation: number,
          ): Promise<NarrativeRepetitionRepairCandidate | undefined> => {
            if (generation !== orchestrator.getLifeGeneration()) return undefined
            const repairInstruction = [
              buildRepetitionRepairInstruction(repetitionResult),
              '【近期已成立历史；必须保持阶段、关系与因果连续】',
              recentHistory.join('\n\n'),
              '【上一版完整输出；保留摘要与结构化结果表达的事实】',
              previousContent,
            ].join('\n')
            const rawCandidate = await callAIWithPromptTemplate(
              narrativeRepetitionRepairPrompt,
              repairInstruction,
              {
                ...streamOpts,
                serverPromptAssetId: narrativeRepetitionRepairPrompt.serverPromptAssetId,
                onChunk: undefined,
                overrideMaxTokens: Math.max(1200, Math.min(4200, Math.round((wordCountTarget || 600) * 5))),
                overrideTemperature: 0.55,
                logContext: {
                  ...streamOpts.logContext,
                  callKind: 'narrative-repetition-repair',
                },
              },
            )
            if (generation !== orchestrator.getLifeGeneration()) return undefined
            const candidateOutput = parseNarrativeRepetitionRepairOutput(rawCandidate)
            if (candidateOutput?.narrative) {
              orchestrator.assertNarrativeContentSafe(candidateOutput.narrative)
            }
            const candidateDecision = chooseNarrativeRepetitionRepair({
              previousContent,
              candidateContent: rawCandidate,
              candidateBody: candidateOutput?.narrative ?? null,
              candidateProtocolValid: Boolean(candidateOutput),
              recentHistory,
            })
            if (!candidateDecision.accepted) return undefined

            const rawAudit = await callAIWithPromptTemplate(
              narrativeRepetitionAuditPrompt,
              [
                '【近期已成立历史】',
                recentHistory.join('\n\n'),
                '【上一版完整输出】',
                previousContent,
                '【改写候选】',
                rawCandidate,
              ].join('\n'),
              {
                ...streamOpts,
                serverPromptAssetId: narrativeRepetitionAuditPrompt.serverPromptAssetId,
                onChunk: undefined,
                strictSchema: true,
                overrideMaxTokens: 900,
                overrideTemperature: 0,
                logContext: {
                  ...streamOpts.logContext,
                  callKind: 'narrative-repetition-audit',
                },
              },
            )
            if (generation !== orchestrator.getLifeGeneration()) return undefined
            const audit = parseNarrativeRepetitionAuditOutput(parseAIJSON(rawAudit))
            if (!audit?.事实一致
              || !audit.完整覆盖
              || audit.覆盖证据.length === 0
              || audit.冲突.length > 0
              || audit.遗漏.length > 0) return undefined
            return { content: candidateOutput?.content ?? rawCandidate, audit }
          }

          if (!initialQuality.valid) {
            // 正文与结束标记完整时先交付正文。玩家明确请求的强制分支在
            // 后台补齐并只合并通过严格校验的分支 META，绝不重写已显示正文。
            // 只有正文协议本身不完整时才在前台等待一次最小格式修复。
            if (canContinueWithNarrativeBody(initialQuality, expectedIntentId, requireBranch)) {
              const previousContent = ctx._fullContent ?? ''
              if (
                requireBranch
                && initialQuality.conditionalFailure === 'branch'
                && !orchestrator.isPreviewExecution()
              ) {
                const generation = orchestrator.getLifeGeneration()
                const roundToken = orchestrator.getRoundExecutionToken()
                const ownerToken = roundToken
                  ? orchestrator.tryBeginForcedBranchRepair(generation)
                  : undefined
                if (roundToken && ownerToken) {
                  ctx._forcedBranchRepairGeneration = generation
                  ctx._forcedBranchRepairOwnerToken = ownerToken
                  ctx._forcedBranchRepairSourceNarrative = extractTaggedMetaEnvelope(previousContent)?.narrative
                    ?? previousContent.trim()
                  ctx._forcedBranchRepairRoundToken = roundToken
                  ctx._forcedBranchRepair = repairForcedBranchInBackground(
                    previousContent,
                    generation,
                  )
                    .catch((error) => {
                      console.warn('[Orchestrator] 强制命运分支后台补救失败:', error)
                      return undefined
                    })
                    .finally(() => {
                      // 只有本请求的 owner token 能释放等待态；旧人生结果不得清除新请求。
                      orchestrator.finishForcedBranchRepair(ownerToken)
                    })
                }
              }
              ctx._fullContent = preserveNarrativeBodyAndSummary(ctx._fullContent ?? '')
              console.warn(
                '[Orchestrator] 条件 META 未完成；先提交完整正文，结构化状态保持待处理:',
                initialQuality.reason,
              )
            } else {
              const previousContent = ctx._fullContent ?? ''
              ctx._fullContent = await runTargetedRepair(initialQuality, previousContent, false)
              let repairedQuality = inspectNarrativeResponseQuality(
                ctx._fullContent ?? '',
                wordCountTarget,
                expectedIntentId,
                requireBranch,
              )
              if (repairedQuality.dataAdvisory) {
                console.info('[Orchestrator]', repairedQuality.dataAdvisory)
              }
              // 条件意图/强制分支是玩家当前动作的关键路径；首轮修复仍波动时，
              // 再进行一次同一失败原因的协议修复，避免玩家只能靠刷新恢复。
              if (!repairedQuality.valid && requireBranch) {
                const secondPreviousContent = ctx._fullContent ?? previousContent
                ctx._fullContent = await runTargetedRepair(repairedQuality, secondPreviousContent, true)
                repairedQuality = inspectNarrativeResponseQuality(
                  ctx._fullContent ?? '',
                  wordCountTarget,
                  expectedIntentId,
                  requireBranch,
                )
              }
              if (!repairedQuality.valid) {
                if (canContinueWithNarrativeBody(repairedQuality, expectedIntentId, requireBranch)) {
                  ctx._fullContent = preserveNarrativeBodyAndSummary(ctx._fullContent ?? '')
                  console.warn(
                    '[Orchestrator] 修复后条件 META 仍未完成；保留完整正文，结构化状态保持待处理:',
                    repairedQuality.reason,
                  )
                } else {
                  const logQualityFailure = orchestrator.isPreviewExecution() ? console.info : console.warn
                  logQualityFailure('[Orchestrator] 叙事完整重写后仍未通过质量门禁:', repairedQuality.reason)
                  orchestrator.resetCurrentNarrative()
                  orchestrator.setLastExecutedFullContent(undefined)
                  if (!orchestrator.isPreviewExecution()) {
                    useEngineStore.setState({ streamingNarrative: '' })
                  }
                  ctx._fullContent = undefined
                }
              }
            }
          }

          // 重复检测只做观测；完整正文优先交付，后台候选在独立质量门禁通过后再替换同一历史条目。
          if (ctx._fullContent?.trim()) {
            const envelope = extractTaggedMetaEnvelope(ctx._fullContent)
            if (envelope) {
              const recentHistory = orchestrator.getState().narrativeHistory
                .slice(-6)
                .map((entry) => entry.text)
              const repetitionResult = checkNarrativeRepetition(envelope.narrative, recentHistory)
              if (repetitionResult.isRepetitive) {
                const percent = Math.round(repetitionResult.maxSimilarity * 100)
                console.warn(
                  `[Orchestrator] 叙事重复检测：相似度 ${percent}%，先交付正文并启动后台候选修复`,
                )
                const generation = orchestrator.getLifeGeneration()
                const ownerToken = orchestrator.tryBeginNarrativeRepetitionRepair(generation)
                const roundToken = orchestrator.getRoundExecutionToken()
                if (!orchestrator.isPreviewExecution() && ownerToken && roundToken) {
                  const previousContent = ctx._fullContent
                  ctx._repetitionRepairGeneration = generation
                  ctx._repetitionRepairOwnerToken = ownerToken
                  ctx._repetitionRepairSourceContent = previousContent
                  ctx._repetitionRepairRoundToken = roundToken
                  ctx._repetitionRepair = repairRepetitiveNarrativeInBackground(
                    previousContent,
                    repetitionResult,
                    recentHistory,
                    generation,
                  ).catch((error) => {
                    console.warn('[Orchestrator] 后台重复修复请求失败，保留原正文:', error)
                    return undefined
                  }).finally(() => {
                    orchestrator.finishNarrativeRepetitionRepair(ownerToken)
                  })
                } else if (ownerToken) {
                  orchestrator.finishNarrativeRepetitionRepair(ownerToken)
                }
              }
            }
          }

          recordRoundCacheMetrics({
            strategy: segments.strategy === 'S4'
              ? 'S4'
              : segments.strategy === 'S2'
                ? 'S2'
                : segments.strategy === 'S3'
                  ? 'S3'
                  : 'S1',
            stablePrefixChars: segments.stablePrefixChars,
            userMessageCount: segments.userMessageCount ?? 1,
          })
        } catch (err) {
          if (isNarrativeSafetyRejectedError(err)) {
            console.warn('[Orchestrator] 叙事输出未通过未成年人安全门禁，本轮整体拒绝')
            orchestrator.resetCurrentNarrative()
            orchestrator.setLastExecutedFullContent(undefined)
            if (!orchestrator.isPreviewExecution()) {
              useEngineStore.setState({ streamingNarrative: '' })
            }
            ctx._fullContent = undefined
            throw err
          }
          console.error('[Orchestrator] AI 调用完全失败（降级链耗尽）:', err)
          orchestrator.resetCurrentNarrative()
          orchestrator.setLastExecutedFullContent(undefined)
          if (!orchestrator.isPreviewExecution()) {
            useEngineStore.setState({ streamingNarrative: '' })
          }
          ctx._fullContent = undefined
        }
      },
      maxRounds: 1,
    },

    // === 阶段 9: 解析响应 + 分发变更 + 世界方向修正 ===
    {
      name: 'post-processing',
      onEnter: (_ctx) => {
        const ctx = _ctx as StageRuntimeContext
        if (!ctx._fullContent) return
        orchestrator.setLastExecutedFullContent(ctx._fullContent)
        if (orchestrator.isPreviewExecution()) {
          ctx._roundResult = {
            narrative: '',
            changes: [],
            notableEvents: [],
          }
          return
        }
        const result = orchestrator.handleNarrativeResponse(ctx._fullContent)

        if (ctx._repetitionRepair && ctx._repetitionRepairRoundToken) {
          const sourceState = orchestrator.getState()
          const history = sourceState.narrativeHistory
          const narrativeEntryId = history[history.length - 1]?.id
          const roundToken = ctx._repetitionRepairRoundToken
          if (narrativeEntryId) {
            void ctx._repetitionRepair.then((candidate) => {
              if (!candidate) return
              const sourceContent = ctx._repetitionRepairSourceContent ?? ''
              const sourceNarrative = extractTaggedMetaEnvelope(sourceContent)?.narrative ?? ''
              orchestrator.enqueueAfterRoundCommit(roundToken, () => {
                const applied = orchestrator.applyBackgroundNarrativeRepair(
                  narrativeEntryId,
                  sourceContent,
                  candidate.content,
                  candidate.audit,
                  {
                    lifeGeneration: ctx._repetitionRepairGeneration ?? -1,
                    lifeRunId: sourceState.lifeRunId,
                    sourceRound: sourceState.totalRounds,
                    sourceNarrative,
                  },
                )
                if (applied) orchestrator.triggerAutoSave()
              })
            })
          }
        }

        if (ctx._forcedBranchRepair && ctx._forcedBranchRepairRoundToken) {
          const sourceState = orchestrator.getState()
          const history = sourceState.narrativeHistory
          const narrativeEntryId = history[history.length - 1]?.id
          const roundToken = ctx._forcedBranchRepairRoundToken
          if (!narrativeEntryId) {
            useEngineStore.getState().setBranchRepairPending(false)
          } else {
            void ctx._forcedBranchRepair
              .then((branchRepair) => {
                if (!branchRepair) return
                orchestrator.enqueueAfterRoundCommit(roundToken, () => {
                  const applied = orchestrator.applyBackgroundForcedBranchRepair(
                    narrativeEntryId,
                    branchRepair,
                    {
                      lifeGeneration: ctx._forcedBranchRepairGeneration ?? -1,
                      lifeRunId: sourceState.lifeRunId,
                      sourceRound: sourceState.totalRounds,
                      sourceNarrative: ctx._forcedBranchRepairSourceNarrative ?? '',
                    },
                  )
                  if (applied) {
                    orchestrator.triggerAutoSave()
                  } else {
                    console.warn('[Orchestrator] 强制命运分支后台结果未通过最终合并门禁')
                  }
                })
              })
          }
        }

        // 存储 notableEvents，供下一轮跨域联动使用
        if (result.notableEvents?.length) {
          orchestrator.setLastNotableEvents(result.notableEvents)
        }

        // 记忆生命周期：消费 handleNarrativeResponse 已登记的结构化语义
        if (result.narrative) {
          const state = orchestrator.getState()
          memoryLifecycle.scoreImportance(
            result.narrative,
            state.totalRounds,
            state.round.year,
            _ctx.contextId,
          )
        }

        // 世界方向修正
        orchestrator.applyWorldDirectionFromNarrative(result.narrative)
        ctx._roundResult = result
      },
      maxRounds: 1,
    },

    // === 阶段 10: 死亡检测 → 触发死后尾声 ===
    {
      name: 'epilogue-check',
      onEnter: async (_ctx) => {
        if (orchestrator.isPreviewExecution()) return
        await orchestrator.checkAndTriggerEpilogue(aiConfig, sessionId)
      },
      maxRounds: 1,
    },

    // === 阶段 11: 预留扩展点（压缩在 handleNarrativeResponse 内部，自动保存由 hooks.ts 调用） ===
    {
      name: 'compress-save',
      onEnter: () => {
        // 此阶段为占位，供未来扩展
      },
      maxRounds: 1,
    },
  ]

  return stages
}

// Prompt 模块 re-export（供 orchestrator 通过 campaign 统一加载）
export { getWorldRules } from './prompts/system-prompt'
