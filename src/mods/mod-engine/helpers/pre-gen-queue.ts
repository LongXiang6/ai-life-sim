/**

 * @module pre-gen-queue.ts

 * @description 叙事预生成队列（快照执行 + 恢复，不污染主模拟状态）

 * @mod mod-engine

 */



import type { AIModelConfig, PromptTemplate, TimeStep } from '@/foundation'
import { encodeTimeStepKey } from '@/foundation'
import { DEFAULT_AI_MODEL } from '@/core/ai-service'

import { useSettingsStore } from '@/mods/mod-settings'

import { orchestrator } from '../subsystems/orchestrator-system'
import { useEngineStore } from '../store'
import { computeNarrativeMaxTokens, DEFAULT_WORD_COUNT_TARGET } from '../constants/narrative-config'
import { isEligibleNarrativeBranch } from './narrative-branch-policy'
import {
  canContinueWithNarrativeBody,
  inspectNarrativeResponseQuality,
} from './narrative-response-quality'
import {
  type NarrativeRoundMetadata,
} from './narrative-semantic-signals'
import {
  parseNarrativeAIDataJson,
  translateNarrativeAIResponse,
} from './narrative-ai-protocol'
import { PreGenActivityState } from './pre-gen-activity-state'
import { extractTaggedMetaEnvelope } from './tagged-meta-envelope'

export interface PreGenCachedRound {
  fullContent: string
  isBranchPoint: boolean
  signature: string
}

export interface PreGenQueueStatus {
  isActive: boolean
  queueLength: number
  maxRounds: number
}

const preGenQueue: PreGenCachedRound[] = []
const preGenActivity = new PreGenActivityState()

/**
 * 当前运行时只支持可靠地预生成“下一轮”。历史持久化值 2/3 仍可读取，
 * 但统一收敛为开启，避免重复生成同一个下一轮。
 */
function resolveEffectivePreGenMaxRounds(): number {
  const configuredRounds = useSettingsStore.getState().preGenerateRounds ?? 0
  return configuredRounds > 0 ? 1 : 0
}

function enforceEffectivePreGenQueueLimit(maxRounds: number): void {
  if (preGenQueue.length > maxRounds) {
    preGenQueue.length = maxRounds
  }
}

/** 上次预生成时的时间步长 key（用于检测粒度切换，自动清空旧队列） */
let lastPreGenTimeStepKey: string | null = null



type PreGenListener = () => void

const preGenListeners = new Set<PreGenListener>()

function buildPreGenSignature(promptTemplate: PromptTemplate): string {
  const state = useEngineStore.getState()
  const settings = useSettingsStore.getState()
  const lastEntry = state.narrativeHistory[state.narrativeHistory.length - 1]
  return [
    encodeTimeStepKey(state.timeStep),
    state.totalRounds,
    state.narrativeHistory.length,
    lastEntry?.id ?? '',
    state.round.totalDays,
    settings.provider,
    settings.customUrl,
    settings.customModel,
    settings.temperature,
    settings.reasoningEffort,
    settings.wordCountTarget,
    settings.storySeed,
    settings.narrativeStyleText,
    settings.narrativeStyleVersion,
    promptTemplate.name,
    promptTemplate.version,
    promptTemplate.systemPrompt,
    promptTemplate.userPromptTemplate,
    promptTemplate.outputFormat,
  ].join('|')
}



function notifyPreGenListeners(): void {
  for (const listener of preGenListeners) {
    try {
      listener()
    } catch (error) {
      console.warn('[PreGen] 队列订阅者执行失败:', error)
    }
  }
}



export function subscribePreGenQueue(listener: PreGenListener): () => void {

  preGenListeners.add(listener)

  return () => {

    preGenListeners.delete(listener)

  }

}



export function getPreGenQueueStatus(): PreGenQueueStatus {

  const maxRounds = resolveEffectivePreGenMaxRounds()
  enforceEffectivePreGenQueueLimit(maxRounds)

  return {
    // An invalidated request is still running in the background, but it must
    // not keep the player's current round waiting for an obsolete result.
    isActive: preGenActivity.isActive(),

    queueLength: preGenQueue.length,

    maxRounds,

  }

}



export function clearPreGenQueue(): void {
  preGenQueue.length = 0
  preGenActivity.invalidate()
  // 只让在途结果失效，不提前宣告后台执行结束；后台单写者仍由 isRunning 保持。
  // 不重置 lastPreGenTimeStepKey（保留当前 key，防止并发 fillPreGenQueue 绕过 gen 失效机制）
  notifyPreGenListeners()
}

/** 检测时间步长是否变化，变化则清空旧粒度预生成队列。
 *  应在消费预生成队列前调用。
 *  返回 true 表示已清空（队列中的内容粒度不匹配）。 */
export function checkAndClearPreGenOnTimeStepChange(currentStep: TimeStep): boolean {
  const currentKey = encodeTimeStepKey(currentStep)
  if (lastPreGenTimeStepKey !== null && lastPreGenTimeStepKey !== currentKey) {
    console.log(`[PreGen] 时间步长变化: ${lastPreGenTimeStepKey} → ${currentKey}，已清空旧预生成队列`)
    clearPreGenQueue()
  }
  lastPreGenTimeStepKey = currentKey
  return preGenQueue.length === 0
}



function takePreGenQueueItem(
  promptTemplate: PromptTemplate,
  shouldNotify: boolean,
): PreGenCachedRound | undefined {
  enforceEffectivePreGenQueueLimit(resolveEffectivePreGenMaxRounds())
  const currentSignature = buildPreGenSignature(promptTemplate)
  let item = preGenQueue.shift()
  while (item && item.signature !== currentSignature) {
    console.log('[PreGen] 丢弃上下文不匹配的预生成缓存')
    item = preGenQueue.shift()
  }
  if (item) {
    // 消费预生成项意味着主推进即将接管这份结果。这里让当前生成代失效，
    // 防止 fillPreGenQueue 收尾时因队列变空而基于旧快照递归补下一轮预生成。
    preGenActivity.invalidate()
  }
  // 预生成防御：消费到分支点叙事 → 立即清空剩余预生成队列，避免后续预生成内容携带未解决分支
  if (item?.isBranchPoint) {
    console.log('[PreGen] 消费到分支点叙事，已清空预生成队列')
    preGenQueue.length = 0
  }
  if (shouldNotify) notifyPreGenListeners()
  return item
}

export function shiftPreGenQueue(promptTemplate: PromptTemplate): PreGenCachedRound | undefined {
  return takePreGenQueueItem(promptTemplate, true)
}

export function waitForPreGenQueueItem(
  promptTemplate: PromptTemplate,
  timeoutMs?: number,
): Promise<PreGenCachedRound | undefined> {
  const immediate = takePreGenQueueItem(promptTemplate, true)
  if (immediate || !preGenActivity.isActive()) return Promise.resolve(immediate)

  return new Promise((resolve) => {
    let settled = false
    let unsubscribe: (() => void) | null = null
    let timer: ReturnType<typeof setTimeout> | null = null

    const finish = (item?: PreGenCachedRound) => {
      if (settled) return
      settled = true
      if (timer) clearTimeout(timer)
      unsubscribe?.()
      resolve(item)
    }

    unsubscribe = subscribePreGenQueue(() => {
      const item = takePreGenQueueItem(promptTemplate, false)
      if (item || !preGenActivity.isActive()) {
        finish(item)
        notifyPreGenListeners()
      }
    })

    if (timeoutMs !== undefined && timeoutMs > 0) {
      timer = setTimeout(() => finish(undefined), timeoutMs)
    }
  })
}



export function getPreGenQueueLength(): number {
  enforceEffectivePreGenQueueLimit(resolveEffectivePreGenMaxRounds())
  return preGenQueue.length

}



function parsePreGenMetadata(content: string): NarrativeRoundMetadata | null {
  try {
    const envelope = extractTaggedMetaEnvelope(content)
    if (!envelope?.dataPresent) return null
    return translateNarrativeAIResponse(
      parseNarrativeAIDataJson(envelope.dataSection ?? ''),
      envelope.summary,
    )
  } catch {
    return null
  }
}



/** 空闲时后台填充下一轮预生成队列（历史正数设置统一视为开启） */

export async function fillPreGenQueue(

  promptTemplate: PromptTemplate,

  sessionId?: string,

): Promise<void> {

  const maxRounds = resolveEffectivePreGenMaxRounds()
  enforceEffectivePreGenQueueLimit(maxRounds)

  if (maxRounds <= 0) return

  if (useEngineStore.getState().status === 'complete') return

  if (preGenActivity.isRunning()) return

  if (preGenQueue.length >= maxRounds) return

  if (useEngineStore.getState().forceBranchNext) return



  const history = useEngineStore.getState().narrativeHistory
  const hasUnresolvedBranch = history.some(
    (entry) => entry.isBranchPoint && entry.resolvedChoice === undefined,
  )

  if (hasUnresolvedBranch) return



  const gen = preGenActivity.begin()
  try {
    notifyPreGenListeners()

    // 上一真实回合的异步摘要压缩可能仍在提交。预生成快照必须等它完成，
    // 否则恢复旧快照会回滚刚生成的摘要与记忆索引。
    await orchestrator.waitForBackgroundCompression()
    if (!preGenActivity.isCurrent(gen)) return

    const { customModel, temperature, reasoningEffort, provider } = useSettingsStore.getState()
    // 从单一来源常量取默认字数，与 orchestrator、hooks 共享同一常量
    const wordCountTarget = useSettingsStore.getState().wordCountTarget ?? DEFAULT_WORD_COUNT_TARGET
    const model = customModel || DEFAULT_AI_MODEL
    const aiConfig: AIModelConfig = {
      model,
      temperature: temperature ?? 0.8,
      maxTokens: computeNarrativeMaxTokens(wordCountTarget, {
        reasoningEffort,
        providerId: provider,
        model,
      }),
      stream: false,
      reasoningEffort,
    }

    const snapshot = orchestrator.capturePreviewSnapshot()
    const signature = buildPreGenSignature(promptTemplate)
    const expectedIntentId = snapshot.orchestrator.focusedBranchIntentId ?? null

    try {
      // 快照恢复必须包含在预览单写者门内。否则取消后真实回合可能已经开始，
      // 旧预览再恢复快照会覆盖主回合的时间线与子系统状态。
      await orchestrator.runPreviewRound(async () => {
        try {
          await orchestrator.executeRoundV2(promptTemplate, aiConfig, sessionId)

          if (!preGenActivity.isCurrent(gen)) return

          const fullContent = orchestrator.getLastExecutedFullContent()
          if (!fullContent?.trim()) return

          const wordCountTarget = useSettingsStore.getState().wordCountTarget
            ?? DEFAULT_WORD_COUNT_TARGET
          const responseQuality = inspectNarrativeResponseQuality(fullContent, wordCountTarget, expectedIntentId)
          if (
            !responseQuality.valid
            && !canContinueWithNarrativeBody(responseQuality, expectedIntentId)
          ) {
            console.info('[PreGen] 预生成响应未通过协议或段落结构门禁，已放弃缓存:', responseQuality.reason)
            return
          }

          // 普通轮允许正文+摘要作为最低成功；有效数据区仍用于预判命运分支。
          // 当前命运意图缺失条件 META 时仍可缓存完整正文；主推进会保持意图待处理，
          // 不把未验证的判定写入状态。
          const metadata = parsePreGenMetadata(fullContent)
          const isBranchPoint = metadata ? isEligibleNarrativeBranch(metadata) : false
          if (isBranchPoint && orchestrator.isBranchCoolingDownForNextRound()) {
            // 分支是强交互事件。冷却期内丢弃预生成分支，改由主推进用最新玩家选择现场生成。
            return
          }

          preGenQueue.push({
            fullContent,
            isBranchPoint,
            signature,
          })
        } finally {
          if (preGenActivity.isCurrent(gen)) {
            orchestrator.restorePreviewSnapshot(snapshot)
          } else {
            orchestrator.reconcilePreviewSnapshotWithEngineStore(snapshot)
          }
        }
      }, preGenActivity.getSignal(gen))
    } catch (err) {
      if (preGenActivity.isCurrent(gen) && !(err instanceof Error && err.name === 'AbortError')) {
        console.warn('[PreGen] 预生成失败:', err)
      }
    }
  } finally {
    // begin() 后的任意读取、快照、恢复或 listener 异常都不能永久锁住主推进。
    preGenActivity.finish(gen)
    notifyPreGenListeners()
  }



  // 当前运行时只支持可靠预生成“下一轮”，单次尝试结束后不递归补池。
  // 失败、空响应或 Schema 无效时等待下一次真实回合触发，避免后台无退避无限请求。

}


