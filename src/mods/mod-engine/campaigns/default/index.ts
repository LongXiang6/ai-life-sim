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
import { eventBus, callAIWithPromptTemplate, callAIDegraded, buildSegmentedPrompt, getNarrativeUserSegments, recordRoundCacheMetrics } from '@/core'
import { memoryLifecycle } from '../../subsystems/memory-lifecycle-system'
import { buildEventInjectionText } from '../../helpers/event-lifecycle-tracker'
import { useSettingsStore } from '@/mods/mod-settings'
import { useEngineStore } from '../../store'
import { orchestrator } from '../../subsystems/orchestrator-system'
import { runImmersionWarmupPass } from '../../helpers/immersion-two-pass'

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
        eventBus.emit('mod-engine:round-start', orchestrator.getRound())
        orchestrator.advanceTime()
      },
      maxRounds: 1,
    },

    // === 阶段 3: 本地模拟推进（所有子系统的纯规则推演） ===
    {
      name: 'subsystem-advance',
      onEnter: () => {
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
        const hadMacroEvents = !!ctx._eventInjectionText
        await orchestrator.executeCrossDomainLinkage()
        ctx._crossDomainTriggered = true

        orchestrator.collectAllSubsystemStates()

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

        const prefetched = orchestrator.consumePrefetchedNarrative()
        if (prefetched) {
          orchestrator.resetCurrentNarrative()
          useEngineStore.setState({ streamingNarrative: '' })
          ctx._fullContent = prefetched
          return
        }

        const { customKey, provider, customUrl, customModel } = useSettingsStore.getState()
        const model = customModel || aiConfig.model
        const routeOpts = { providerId: provider, customBaseUrl: customUrl || undefined, customModel: model }

        const baseSegments = buildSegmentedPrompt(promptTemplate, ctx._promptContext)

        // Pass 1: 沉浸模式记忆预热（IMMERSION_TWO_PASS_ENABLED 时，共享 stable 前缀）
        ctx._warmupAck = await runImmersionWarmupPass(
          ctx._promptContext,
          promptTemplate.systemPrompt,
          {
            config: { ...aiConfig, model },
            sessionId,
            apiKey: customKey || undefined,
            ...routeOpts,
            stableUserPrefix: baseSegments.stablePrefix,
            logContext: {
              round: orchestrator.getState().totalRounds,
              age: ctx._promptContext.character?.age,
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
        useEngineStore.setState({ streamingNarrative: '' })

        const useStream = useSettingsStore.getState().streamingMode === 'stream'

        const roundInfo = orchestrator.getState().round
        const logContext = {
          round: orchestrator.getState().totalRounds,
          age: ctx._promptContext.character?.age ?? roundInfo.year,
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
          sessionId,
          apiKey: customKey || undefined,
          logContext,
          ...routeOpts,
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

          recordRoundCacheMetrics({
            strategy: segments.strategy === 'S2' ? 'S2' : segments.strategy === 'S3' ? 'S3' : 'S1',
            stablePrefixChars: segments.stablePrefixChars,
            userMessageCount: segments.userMessageCount ?? 1,
          })
        } catch (err) {
          console.error('[Orchestrator] AI 调用完全失败（降级链耗尽）:', err)
          ctx._fullContent = fallbackNarrative
        }
      },
      shouldProceed: (_ctx) => (_ctx as StageRuntimeContext)._fullContent !== undefined,
      maxRounds: 1,
    },

    // === 阶段 9: 解析响应 + 分发变更 + 叙事后处理 + 世界方向修正 ===
    {
      name: 'post-processing',
      onEnter: (_ctx) => {
        const ctx = _ctx as StageRuntimeContext
        if (!ctx._fullContent) return
        orchestrator.setLastExecutedFullContent(ctx._fullContent)
        const result = orchestrator.handleNarrativeResponse(ctx._fullContent)

        // 存储 notableEvents，供下一轮跨域联动使用
        if (result.notableEvents?.length) {
          orchestrator.setLastNotableEvents(result.notableEvents)
        }

        // 叙事后处理
        if (result.narrative) {
          orchestrator.runNarrativePostProcessing(result.narrative)
        }

        // 记忆生命周期：重要性评分
        if (result.narrative) {
          memoryLifecycle.scoreImportance(result.narrative, orchestrator.getRound().year)
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
        await orchestrator.checkAndTriggerEpilogue(aiConfig, sessionId)
      },
      maxRounds: 1,
    },

    // === 阶段 11: 压缩 + 自动保存（由 handleNarrativeResponse 内部处理） ===
    {
      name: 'compress-save',
      onEnter: () => {
        // handleNarrativeResponse 内部已调用 checkAndCompress() + triggerAutoSave()
        // 此阶段为占位，供未来扩展
      },
      maxRounds: 1,
    },
  ]

  return stages
}

// Prompt 模块 re-export（供 orchestrator 通过 campaign 统一加载）
export { getWorldRules } from './prompts/system-prompt'
