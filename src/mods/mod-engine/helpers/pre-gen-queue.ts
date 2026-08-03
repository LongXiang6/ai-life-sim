/**
 * Purpose: Keep the legacy pre-generation queue contract without executing speculative rounds.
 * Owner: mod-engine
 * Responsibility: Queue status, invalidation, and listener coordination only; runtime preview execution is removed.
 *
 * @module pre-gen-queue.ts
 * @description 叙事预生成队列状态与缓存契约；当前不执行 speculative 回合。
 * @mod mod-engine
 */



import type { LuckNarrativeGuidance, PromptTemplate, TimeStep } from '@/foundation'
import { encodeTimeStepKey } from '@/foundation'

import { useSettingsStore } from '@/mods/mod-settings/settings-runtime-api'

import { orchestrator } from '../subsystems/orchestrator-system'
import { useEngineStore } from '../store'
import { DEFAULT_WORD_COUNT_TARGET } from '../constants/narrative-config'
import { PreGenActivityState } from './pre-gen-activity-state'

export interface PreGenCachedRound {
  fullContent: string
  isBranchPoint: boolean
  signature: string
  luckGuidance: LuckNarrativeGuidance
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
  const luckState = orchestrator.getSubsystemStateSnapshot().luck?.data ?? null
  return [
    encodeTimeStepKey(state.timeStep),
    state.totalRounds,
    state.narrativeHistory.length,
    lastEntry?.id ?? '',
    state.round.totalDays,
    JSON.stringify(luckState),
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

/** 取消缓存和在途预生成，并等待后台活动结束。 */
export async function cancelPreGenQueue(): Promise<void> {
  clearPreGenQueue()
  await preGenActivity.waitForIdle()
}

export function isPreGenQueueRunning(): boolean {
  return preGenActivity.isRunning()
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



/**
 * 运行时预览与整轮快照已删除，因而不再启动会改变编排器状态的预生成回合；
 * 保留队列公开契约以便设置与旧存档平滑收敛。
 */

export async function fillPreGenQueue(
  promptTemplate: PromptTemplate,
  _sessionId?: string,
): Promise<void> {
  void promptTemplate
  console.info('[PreGen] 运行时预览已移除，跳过会改写运行态的预生成回合')
}


