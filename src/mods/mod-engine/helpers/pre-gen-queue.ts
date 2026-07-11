/**

 * @module pre-gen-queue.ts

 * @description 叙事预生成队列（快照执行 + 恢复，不污染主模拟状态）

 * @mod mod-engine

 */



import type { AIModelConfig, PromptTemplate, TimeStep } from '@/foundation'
import { encodeTimeStepKey } from '@/foundation'

import { useSettingsStore } from '@/mods/mod-settings'

import { orchestrator } from '../subsystems/orchestrator-system'
import { useEngineStore } from '../store'
import { computeNarrativeMaxTokens, DEFAULT_WORD_COUNT_TARGET } from '../constants/narrative-config'
import { isEligibleNarrativeBranch } from './narrative-branch-policy'
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

/** 上次预生成时的时间步长 key（用于检测粒度切换，自动清空旧队列） */
let lastPreGenTimeStepKey: string | null = null



type PreGenListener = () => void

const preGenListeners = new Set<PreGenListener>()

function buildPreGenSignature(): string {
  const state = useEngineStore.getState()
  const lastEntry = state.narrativeHistory[state.narrativeHistory.length - 1]
  return [
    encodeTimeStepKey(state.timeStep),
    state.totalRounds,
    state.narrativeHistory.length,
    lastEntry?.id ?? '',
    state.round.totalDays,
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

  const maxRounds = useSettingsStore.getState().preGenerateRounds ?? 0

  return {
    isActive: preGenActivity.isActive(),

    queueLength: preGenQueue.length,

    maxRounds,

  }

}



export function clearPreGenQueue(): void {
  preGenQueue.length = 0
  preGenActivity.invalidate()
  // 只让在途结果失效，不提前宣告后台执行结束；主推进必须等共享 orchestrator 释放。
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



function takePreGenQueueItem(shouldNotify: boolean): PreGenCachedRound | undefined {
  const currentSignature = buildPreGenSignature()
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

export function shiftPreGenQueue(): PreGenCachedRound | undefined {
  return takePreGenQueueItem(true)
}

export function waitForPreGenQueueItem(timeoutMs?: number): Promise<PreGenCachedRound | undefined> {
  const immediate = takePreGenQueueItem(true)
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
      const item = takePreGenQueueItem(false)
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

  return preGenQueue.length

}



function narrativeJsonHasBranch(content: string): boolean {
  try {
    // 当前主叙事输出是 [NARRATIVE]/[META] 信封；预生成分支判断必须读 META，
    // 与主解析共用容错信封和分支资格，避免预生成接受主链会抑制的普通选择。
    const envelope = extractTaggedMetaEnvelope(content)
    const raw = JSON.parse(envelope?.metaJson ?? content) as Record<string, unknown>
    return isEligibleNarrativeBranch(raw)
  } catch {
    return false
  }
}



/** 空闲时后台填充预生成队列（读取设置 preGenerateRounds） */

export async function fillPreGenQueue(

  promptTemplate: PromptTemplate,

  sessionId?: string,

): Promise<void> {

  const maxRounds = useSettingsStore.getState().preGenerateRounds ?? 0

  if (maxRounds <= 0) return

  if (preGenActivity.isActive()) return

  if (preGenQueue.length >= maxRounds) return

  if (useEngineStore.getState().forceBranchNext) return



  const history = useEngineStore.getState().narrativeHistory
  const hasUnresolvedBranch = history.some(
    (entry) => entry.isBranchPoint && entry.resolvedChoice === undefined,
  )

  if (hasUnresolvedBranch) return



  const gen = preGenActivity.begin()
  let lastIsBranch = false
  try {
    notifyPreGenListeners()

    const { customModel, temperature } = useSettingsStore.getState()
    // 从单一来源常量取默认字数，与 orchestrator、hooks 共享同一常量
    const wordCountTarget = useSettingsStore.getState().wordCountTarget ?? DEFAULT_WORD_COUNT_TARGET
    const model = customModel || 'deepseek-v4-flash'
    const aiConfig: AIModelConfig = {
      model,
      temperature: temperature ?? 0.8,
      maxTokens: computeNarrativeMaxTokens(wordCountTarget),
      stream: false,
    }

    const snapshot = orchestrator.capturePreviewSnapshot()
    const signature = buildPreGenSignature()

    try {
      await orchestrator.runPreviewRound(() =>
        orchestrator.executeRoundV2(promptTemplate, aiConfig, sessionId),
      )

      if (!preGenActivity.isCurrent(gen)) return

      const fullContent = orchestrator.getLastExecutedFullContent()
      if (!fullContent?.trim()) return

      const isBranchPoint = narrativeJsonHasBranch(fullContent)
      if (isBranchPoint && orchestrator.isBranchCoolingDownForNextRound()) {
        // 分支是强交互事件。冷却期内丢弃预生成分支，改由主推进用最新玩家选择现场生成。
        lastIsBranch = true
        return
      }

      preGenQueue.push({
        fullContent,
        isBranchPoint,
        signature,
      })
      lastIsBranch = isBranchPoint
    } catch (err) {
      console.warn('[PreGen] 预生成失败:', err)
    } finally {
      if (preGenActivity.isCurrent(gen)) {
        orchestrator.restorePreviewSnapshot(snapshot)
      } else {
        orchestrator.reconcilePreviewSnapshotWithEngineStore(snapshot)
      }
    }
  } finally {
    // begin() 后的任意读取、快照、恢复或 listener 异常都不能永久锁住主推进。
    preGenActivity.finish(gen)
    try {
      useEngineStore.setState({ streamingNarrative: '' })
    } finally {
      notifyPreGenListeners()
    }
  }



  if (preGenActivity.isCurrent(gen) && preGenQueue.length < maxRounds && !lastIsBranch) {

    void fillPreGenQueue(promptTemplate, sessionId)

  }

}


