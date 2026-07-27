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
import { logger } from '@/core/logger/client-logger'
import { memoryLifecycle } from '../../subsystems/memory-lifecycle-system'
import { buildEventInjectionText } from '../../helpers/event-lifecycle-tracker'
import { useSettingsStore } from '@/mods/mod-settings'
import { useEngineStore } from '../../store'
import { orchestrator } from '../../subsystems/orchestrator-system'
import { runImmersionWarmupPass } from '../../helpers/immersion-two-pass'
import { DEFAULT_WORD_COUNT_TARGET } from '../../constants/narrative-config'
import {
  canContinueWithNarrativeBody,
  buildNarrativeDataRepairInstruction,
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
import {
  extractTaggedMetaEnvelope,
  extractTaggedNarrativePrefix,
  replaceTaggedMetaDataSection,
  TAGGED_NARRATIVE_PROTOCOL,
} from '../../helpers/tagged-meta-envelope'
import { buildBranchIntentInstruction } from '../../helpers/branch-intent-resolution'
import { NARRATIVE_REPAIR_SERVER_PROMPT_ASSET_ID } from '../../prompts/narrative-prompt'
import {
  narrativeBranchRepairOutputSchema,
  narrativeBranchRepairPrompt,
} from '../../prompts/narrative-branch-repair-prompt'
import { narrativeDataRepairPrompt } from '../../prompts/narrative-data-repair-prompt'
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
import { notifyLegendaryEncounterInjected } from '@/core/player-content/player-content-client'

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
  _legendaryEncounterInjected?: boolean
}

function buildLegendaryEncounterGuidance(
  encounter: NonNullable<ReturnType<typeof useEngineStore.getState>['legendaryEncounter']>,
): string {
  const representative = encounter.achievements.find((item) => item.kind === 'breakthrough')
    ?? encounter.achievements[0]
  return [
    '【低优先级异界传闻素材】',
    `另一段人生曾发生于“${encounter.worldName}”，主角名为“${encounter.characterName}”。`,
    `留下的结算评语：${encounter.endingReview}`,
    ...(representative
      ? [`可引用事件：${representative.timeLabel}，${representative.title}：${representative.detail}`]
      : []),
    '仅在不影响本轮主线、玩家意图、命运事件和连续性的前提下，把它改写成当前世界能够理解的一小段传说、书页、旧档案、梦境、遗物铭文或路人故事。',
    '不得让传闻直接改变主角属性、强制选择或夺取主线；不适合出现时可以完全不用。',
  ].join('\n')
}

function replaceNarrativeBodyPreservingMetadata(
  sourceContent: string,
  replacementNarrative: string,
): string {
  const source = extractTaggedMetaEnvelope(sourceContent)
  if (!source) return sourceContent
  return [
    TAGGED_NARRATIVE_PROTOCOL.body,
    replacementNarrative,
    ...(source.summary
      ? [TAGGED_NARRATIVE_PROTOCOL.summary, source.summary]
      : []),
    ...(source.dataPresent
      ? [TAGGED_NARRATIVE_PROTOCOL.data, source.dataSection ?? '']
      : []),
    TAGGED_NARRATIVE_PROTOCOL.end,
  ].join('\n')
}

/**
 * Use the same committed body for foreground delivery and background branch repair.
 * A body-only tagged prefix is accepted only after an explicit section boundary;
 * an untagged plain response remains a valid body-only fallback.
 */
function extractRepairSourceNarrative(content: string): string {
  const envelope = extractTaggedMetaEnvelope(content)
  if (envelope) return envelope.narrative
  const prefix = extractTaggedNarrativePrefix(content)
  if (prefix) {
    const hasBoundary = prefix.hasSummaryMarker
      || prefix.hasDataMarker
      || prefix.hasEndMarker
    if (hasBoundary) return prefix.narrative
  }
  return content.trim()
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
      onEnter: async (_ctx) => {
        const ctx = _ctx as StageRuntimeContext
        if (!orchestrator.isPreviewExecution()) {
          await orchestrator.refreshNarrativeMemoryRecall()
        }
        const engineState = useEngineStore.getState()
        const encounter = engineState.legendaryEncounter
        const lastNarrative = engineState.narrativeHistory[engineState.narrativeHistory.length - 1]
        const canInjectLegend = !orchestrator.isPreviewExecution()
          && encounter?.status === 'selected'
          && engineState.totalRounds >= 2
          && !ctx._eventInjectionText
          && !orchestrator.getFocusedBranchIntent()
          && !engineState.forceBranchNext
          && !engineState.branchRepairPending
          && !lastNarrative?.resolvedChoice
        const promptContext = orchestrator.assemblePromptContext(ctx._eventInjectionText)
        ctx._promptContext = canInjectLegend && encounter
          ? {
              ...promptContext,
              narrativeGuidanceText: [
                promptContext.narrativeGuidanceText,
                buildLegendaryEncounterGuidance(encounter),
              ].filter(Boolean).join('\n'),
            }
          : promptContext
        ctx._legendaryEncounterInjected = canInjectLegend
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
        const activeStyle = orchestrator.getNarrativeStyleSnapshot()
        orchestrator.noteNarrativeQuality({
          targetWordCount: wordCountTarget,
          styleSource: activeStyle.source,
          styleVersion: activeStyle.version,
          repairAttempts: 0,
          repairKinds: [],
        })
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

        const prefetchedCandidate = orchestrator.consumePrefetchedNarrative()
        const prefetched = ctx._legendaryEncounterInjected ? undefined : prefetchedCandidate
        if (prefetched) {
          const prefetchedQuality = inspectNarrativeResponseQuality(
            prefetched,
            wordCountTarget,
            expectedIntentId,
            requireBranch,
          )
          const canConsumeBodyOnly = canContinueWithNarrativeBody(
            prefetchedQuality,
            expectedIntentId,
            requireBranch,
          ) && prefetchedQuality.conditionalFailure !== 'intent'
          if (prefetchedQuality.valid || canConsumeBodyOnly) {
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
              orchestrator.noteNarrativeQuality({
                source: 'prefetched',
                initialValid: prefetchedQuality.valid,
                initialReason: prefetchedQuality.reason || undefined,
                finalValid: prefetchedQuality.valid,
                acceptedNarrativeBody: prefetchedQuality.valid || canConsumeBodyOnly,
                finalReason: prefetchedQuality.reason || undefined,
                structuredDataStatus: prefetchedQuality.structuredDataStatus,
                conditionalFailure: prefetchedQuality.conditionalFailure,
                narrativeChars: prefetchedQuality.narrativeChars,
                responseChars: candidateContent.length,
              })
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
              lifeRunId: orchestrator.getState().lifeRunId,
              round: orchestrator.getState().totalRounds,
              age: Number(ctx._promptContext.characterStatusView.年龄),
              strategy: baseSegments.strategy,
              callKind: 'immersion-warmup',
              pool: 'narrative',
              model,
              sessionId,
              executionKind: orchestrator.isPreviewExecution() ? 'preview' : 'real',
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
          lifeRunId: orchestrator.getState().lifeRunId,
          round: orchestrator.getState().totalRounds,
          age: Number(ctx._promptContext.characterStatusView.年龄) || roundInfo.year,
          era: ctx._promptContext.currentTime ?? `${roundInfo.eraName}${roundInfo.eraYear}年`,
          strategy: segments.strategy,
          callKind: 'narrative-main',
          pool: 'narrative',
          model,
          sessionId,
          executionKind: orchestrator.isPreviewExecution() ? 'preview' : 'real',
          promptVersion: promptTemplate.version,
          targetWordCount: wordCountTarget,
          styleSource: activeStyle.source,
          styleText: activeStyle.text,
          styleVersion: activeStyle.version,
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
          logMetaResolver: (response: string) => {
            const narrative = extractTaggedMetaEnvelope(response)?.narrative ?? response.trim()
            return {
          targetWordCount: wordCountTarget,
              narrativeChars: narrative.replace(/\s/gu, '').length,
              estimatedNarrativeTokens: Math.ceil(narrative.replace(/\s/gu, '').length * 0.6),
            }
          },
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

          const initialQuality = inspectNarrativeResponseQuality(
            ctx._fullContent ?? '',
            wordCountTarget,
            expectedIntentId,
            requireBranch,
          )
          logger.info('narrative-quality', 'initial-response-inspected', {
            round: orchestrator.getState().totalRounds,
            valid: initialQuality.valid,
            reason: initialQuality.reason || undefined,
            conditionalFailure: initialQuality.conditionalFailure,
            structuredDataStatus: initialQuality.structuredDataStatus,
            validationError: initialQuality.validationError,
            validationIssues: initialQuality.validationIssues,
            narrativeChars: initialQuality.narrativeChars,
            responseChars: ctx._fullContent?.length ?? 0,
            expectedIntent: expectedIntentId ?? undefined,
            requireBranch,
          })
          let repairAttempts = 0
          const repairKinds: string[] = []
          orchestrator.noteNarrativeQuality({
            source: 'live',
            initialValid: initialQuality.valid,
            initialReason: initialQuality.reason || undefined,
            initialConditionalFailure: initialQuality.conditionalFailure,
            initialStructuredDataStatus: initialQuality.structuredDataStatus,
            initialValidationError: initialQuality.validationError,
            initialValidationIssues: initialQuality.validationIssues,
            initialNarrativeChars: initialQuality.narrativeChars,
            responseChars: ctx._fullContent?.length ?? 0,
          })
          if (initialQuality.dataAdvisory) {
            console.info('[Orchestrator]', initialQuality.dataAdvisory)
          }

          const runTargetedRepair = async (
            quality: ReturnType<typeof inspectNarrativeResponseQuality>,
            previousContent: string,
            finalAttempt: boolean,
          ): Promise<string> => {
            const envelope = extractTaggedMetaEnvelope(previousContent)
            repairAttempts += 1
            repairKinds.push(envelope && quality.hasUsableNarrative
              ? 'narrative-data-repair'
              : 'narrative-format-repair')
            orchestrator.noteNarrativeQuality({ repairAttempts, repairKinds: [...repairKinds] })
            if (envelope && quality.hasUsableNarrative) {
              const repairInstruction = buildNarrativeDataRepairInstruction(
                quality,
                envelope.dataSection ?? '',
                expectedIntentId,
                requireBranch,
              )
              const repairedData = await callAIWithPromptTemplate(
                narrativeDataRepairPrompt,
                [
                  repairInstruction,
                  '【已成立正文；只用于核对数据，禁止复述或改写】',
                  envelope.narrative,
                  ...(envelope.summary
                    ? ['【已成立摘要；只用于核对数据，禁止复述或改写】', envelope.summary]
                    : []),
                  ...(focusedIntentRepairInstruction
                    ? ['【当前命运意图条件】', focusedIntentRepairInstruction]
                    : []),
                  ...(finalAttempt
                    ? ['【最后一次数据修复】必须逐项解决全部问题；仍无法成立的可选字段整个省略。']
                    : []),
                ].join('\n'),
                {
                  ...streamOpts,
                  onChunk: undefined,
                  overrideMaxTokens: 2400,
                  overrideTemperature: 0,
                  logContext: {
                    ...streamOpts.logContext,
                    callKind: 'narrative-data-repair',
                  },
                },
              )
              const merged = replaceTaggedMetaDataSection(previousContent, repairedData)
              if (!merged) throw new Error('数据修复结果无法与原叙事信封合并')
              return merged
            }

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
            return repaired
          }

          const repairForcedBranchInBackground = async (
            previousContent: string,
            generation: number,
          ): Promise<NarrativeBranchRepairOutput | undefined> => {
            if (generation !== orchestrator.getLifeGeneration()) return undefined
            const committedNarrative = extractRepairSourceNarrative(previousContent)
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

          const scheduleForcedBranchRepair = (previousContent: string): void => {
            if (
              !requireBranch
              || orchestrator.isPreviewExecution()
              || ctx._forcedBranchRepair
            ) return

            const generation = orchestrator.getLifeGeneration()
            const roundToken = orchestrator.getRoundExecutionToken()
            const ownerToken = roundToken
              ? orchestrator.tryBeginForcedBranchRepair(generation)
              : undefined
            if (!roundToken || !ownerToken) return

            ctx._forcedBranchRepairGeneration = generation
            ctx._forcedBranchRepairOwnerToken = ownerToken
            ctx._forcedBranchRepairSourceNarrative = extractRepairSourceNarrative(previousContent)
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

          const repairRepetitiveNarrative = async (
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
                overrideMaxTokens: 1800,
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
            const canCommitBodyBeforeConditionalRepair = canContinueWithNarrativeBody(
              initialQuality,
              expectedIntentId,
              requireBranch,
            ) && initialQuality.conditionalFailure !== 'intent'
            if (canCommitBodyBeforeConditionalRepair) {
              const previousContent = ctx._fullContent ?? ''
              if (initialQuality.conditionalFailure === 'branch') {
                scheduleForcedBranchRepair(previousContent)
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
              logger.info('narrative-quality', 'repair-response-inspected', {
                round: orchestrator.getState().totalRounds,
                attempt: 1,
                valid: repairedQuality.valid,
                reason: repairedQuality.reason || undefined,
                conditionalFailure: repairedQuality.conditionalFailure,
                structuredDataStatus: repairedQuality.structuredDataStatus,
                validationError: repairedQuality.validationError,
                validationIssues: repairedQuality.validationIssues,
                narrativeChars: repairedQuality.narrativeChars,
              })
              if (repairedQuality.dataAdvisory) {
                console.info('[Orchestrator]', repairedQuality.dataAdvisory)
              }
              // 条件意图/强制分支是玩家当前动作的关键路径；首轮修复仍波动时，
              // 再进行一次同一失败原因的协议修复，避免玩家只能靠刷新恢复。
              if (!repairedQuality.valid && (requireBranch || typeof expectedIntentId === 'string')) {
                const secondPreviousContent = ctx._fullContent ?? previousContent
                ctx._fullContent = await runTargetedRepair(repairedQuality, secondPreviousContent, true)
                repairedQuality = inspectNarrativeResponseQuality(
                  ctx._fullContent ?? '',
                  wordCountTarget,
                  expectedIntentId,
                  requireBranch,
                )
                logger.info('narrative-quality', 'repair-response-inspected', {
                  round: orchestrator.getState().totalRounds,
                  attempt: 2,
                  valid: repairedQuality.valid,
                  reason: repairedQuality.reason || undefined,
                  conditionalFailure: repairedQuality.conditionalFailure,
                  structuredDataStatus: repairedQuality.structuredDataStatus,
                  validationError: repairedQuality.validationError,
                  validationIssues: repairedQuality.validationIssues,
                  narrativeChars: repairedQuality.narrativeChars,
                })
              }
              if (!repairedQuality.valid) {
                const canCommitBodyAfterConditionalRepair = canContinueWithNarrativeBody(
                  repairedQuality,
                  expectedIntentId,
                  requireBranch,
                )
                if (canCommitBodyAfterConditionalRepair) {
                  if (repairedQuality.conditionalFailure === 'branch') {
                    scheduleForcedBranchRepair(ctx._fullContent ?? '')
                  }
                  ctx._fullContent = preserveNarrativeBodyAndSummary(ctx._fullContent ?? '')
                  console.warn(
                    '[Orchestrator] 修复后条件 META 仍未完成；保留完整正文，结构化状态保持待处理:',
                    repairedQuality.reason,
                  )
                } else {
                  const logQualityFailure = orchestrator.isPreviewExecution() ? console.info : console.warn
                  logger.warn('narrative-quality', 'round-rejected-quality-gate', {
                    round: orchestrator.getState().totalRounds,
                    reason: repairedQuality.reason,
                    conditionalFailure: repairedQuality.conditionalFailure,
                    validationError: repairedQuality.validationError,
                    narrativeChars: repairedQuality.narrativeChars,
                    preview: orchestrator.isPreviewExecution(),
                  })
                  logQualityFailure('[Orchestrator] 叙事修复后仍未通过质量门禁:', repairedQuality.reason)
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

          // 重复正文必须在提交前修复。后台替换来不及进入下一轮 Prompt，
          // 会让同一场景被当成已成立历史继续放大成连续剧情循环。
          if (ctx._fullContent?.trim()) {
            const envelope = extractTaggedMetaEnvelope(ctx._fullContent)
            if (envelope) {
              const recentHistory = orchestrator.getState().narrativeHistory
                .slice(-6)
                .map((entry) => entry.text)
              const repetitionResult = checkNarrativeRepetition(envelope.narrative, recentHistory)
              if (repetitionResult.isRepetitive) {
                orchestrator.noteNarrativeQuality({
                  repetitionDetected: true,
                  repetitionSeverity: repetitionResult.severity,
                  repetitionMaxSimilarity: repetitionResult.maxSimilarity,
                })
                logger.warn('narrative-quality', 'repetition-detected', {
                  round: orchestrator.getState().totalRounds,
                  severity: repetitionResult.severity,
                  maxSimilarity: repetitionResult.maxSimilarity,
                })
                const percent = Math.round(repetitionResult.maxSimilarity * 100)
                console.warn(
                  `[Orchestrator] 叙事重复检测：相似度 ${percent}%，提交前执行去重修复`,
                )
                const generation = orchestrator.getLifeGeneration()
                const ownerToken = orchestrator.tryBeginNarrativeRepetitionRepair(generation)
                if (!orchestrator.isPreviewExecution() && ownerToken) {
                  const previousContent = ctx._fullContent
                  let candidate: NarrativeRepetitionRepairCandidate | undefined
                  try {
                    candidate = await repairRepetitiveNarrative(
                      previousContent,
                      repetitionResult,
                      recentHistory,
                      generation,
                    )
                  } catch (error) {
                    console.warn('[Orchestrator] 重复正文修复请求失败:', error)
                  } finally {
                    orchestrator.finishNarrativeRepetitionRepair(ownerToken)
                  }
                  const candidateOutput = candidate
                    ? parseNarrativeRepetitionRepairOutput(candidate.content)
                    : undefined
                  if (candidateOutput?.narrative) {
                    ctx._fullContent = replaceNarrativeBodyPreservingMetadata(
                      previousContent,
                      candidateOutput.narrative,
                    )
                    console.info('[Orchestrator] 重复正文已在本轮提交前完成修复')
                    repairAttempts += 1
                    repairKinds.push('narrative-repetition-repair')
                    orchestrator.noteNarrativeQuality({
                      repairAttempts,
                      repairKinds: [...repairKinds],
                      repetitionRepairAccepted: true,
                    })
                  } else if (repetitionResult.severity === 'high') {
                    console.warn('[Orchestrator] 严重重复正文未通过修复门禁，本轮拒绝提交')
                    orchestrator.resetCurrentNarrative()
                    orchestrator.setLastExecutedFullContent(undefined)
                    useEngineStore.setState({ streamingNarrative: '' })
                    ctx._fullContent = undefined
                    orchestrator.noteNarrativeQuality({ repetitionRepairAccepted: false })
                  }
                } else if (ownerToken) {
                  orchestrator.finishNarrativeRepetitionRepair(ownerToken)
                }
              }
            }
          }

          if (ctx._fullContent?.trim()) {
            const finalQuality = inspectNarrativeResponseQuality(
              ctx._fullContent,
              wordCountTarget,
              expectedIntentId,
              requireBranch,
            )
            orchestrator.noteNarrativeQuality({
              finalValid: finalQuality.valid,
              acceptedNarrativeBody: canContinueWithNarrativeBody(
                finalQuality,
                expectedIntentId,
                requireBranch,
              ),
              finalReason: finalQuality.reason || undefined,
              finalConditionalFailure: finalQuality.conditionalFailure,
              finalStructuredDataStatus: finalQuality.structuredDataStatus,
              finalValidationError: finalQuality.validationError,
              finalValidationIssues: finalQuality.validationIssues,
              narrativeChars: finalQuality.narrativeChars,
              responseChars: ctx._fullContent.length,
              repairAttempts,
              repairKinds: [...repairKinds],
            })
          } else {
            orchestrator.noteNarrativeQuality({
              finalValid: false,
              acceptedNarrativeBody: false,
              finalReason: '没有可提交的完整叙事输出',
              repairAttempts,
              repairKinds: [...repairKinds],
            })
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
          orchestrator.noteNarrativeQuality({
            finalValid: false,
            acceptedNarrativeBody: false,
            finalReason: err instanceof Error ? err.message : String(err),
          })
          console.error('[Orchestrator] AI 调用完全失败（降级链耗尽）:', err)
          logger.error('narrative-ai', 'degraded-chain-exhausted', err)
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

        if (ctx._legendaryEncounterInjected && result.narrative) {
          const engineState = useEngineStore.getState()
          engineState.markLegendaryEncounterInjected(engineState.totalRounds)
          void notifyLegendaryEncounterInjected(engineState.lifeRunId, engineState.totalRounds)
            .catch(() => undefined)
        }

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
