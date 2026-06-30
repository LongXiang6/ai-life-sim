/**

 * @module pre-gen-queue.ts

 * @description 叙事预生成队列（快照执行 + 恢复，不污染主模拟状态）

 * @mod mod-engine

 */



import type { AIModelConfig, PromptTemplate } from '@/foundation'



import { useSettingsStore } from '@/mods/mod-settings'



import { orchestrator } from '../engine-api'

import { useEngineStore } from '../store'

import { computeNarrativeMaxTokens } from '../constants/narrative-config'



export interface PreGenCachedRound {

  fullContent: string

  isBranchPoint: boolean

}



export interface PreGenQueueStatus {

  isActive: boolean

  queueLength: number

  maxRounds: number

}



const preGenQueue: PreGenCachedRound[] = []

let preGenGen = 0

let isPreGenActive = false



type PreGenListener = () => void

const preGenListeners = new Set<PreGenListener>()



function notifyPreGenListeners(): void {

  preGenListeners.forEach((listener) => listener())

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

    isActive: isPreGenActive,

    queueLength: preGenQueue.length,

    maxRounds,

  }

}



export function clearPreGenQueue(): void {

  preGenQueue.length = 0

  preGenGen += 1

  isPreGenActive = false

  notifyPreGenListeners()

}



export function shiftPreGenQueue(): PreGenCachedRound | undefined {

  const item = preGenQueue.shift()

  notifyPreGenListeners()

  return item

}



export function getPreGenQueueLength(): number {

  return preGenQueue.length

}



function narrativeJsonHasBranch(content: string): boolean {

  try {

    const raw = JSON.parse(content) as { branch?: boolean; branchOptions?: unknown[] }

    return raw.branch === true && Array.isArray(raw.branchOptions) && raw.branchOptions.length > 0

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

  if (isPreGenActive) return

  if (preGenQueue.length >= maxRounds) return

  if (useEngineStore.getState().forceBranchNext) return



  const history = useEngineStore.getState().narrativeHistory

  const resolved = useEngineStore.getState().resolvedBranches

  const hasUnresolvedBranch = history.some(

    (entry, index) => entry.isBranchPoint && resolved[index] === undefined,

  )

  if (hasUnresolvedBranch) return



  const gen = ++preGenGen

  isPreGenActive = true

  notifyPreGenListeners()



  const { customModel, temperature } = useSettingsStore.getState()

  const wordCountTarget = useSettingsStore.getState().wordCountTarget ?? 200

  const model = customModel || 'deepseek-v4-flash'

  const aiConfig: AIModelConfig = {

    model,

    temperature: temperature ?? 0.8,

    maxTokens: computeNarrativeMaxTokens(wordCountTarget),

    stream: false,

  }



  const snapshot = orchestrator.captureSnapshot()

  let lastIsBranch = false



  try {

    await orchestrator.executeRoundV2(promptTemplate, aiConfig, sessionId)



    if (gen !== preGenGen) return



    const fullContent = orchestrator.getLastExecutedFullContent()

    if (!fullContent?.trim()) return



    preGenQueue.push({

      fullContent,

      isBranchPoint: narrativeJsonHasBranch(fullContent),

    })

    lastIsBranch = narrativeJsonHasBranch(fullContent)



  } catch (err) {

    console.warn('[PreGen] 预生成失败:', err)

  } finally {

    orchestrator.restoreSnapshot(snapshot)

    isPreGenActive = false

    useEngineStore.setState({ streamingNarrative: '' })

    notifyPreGenListeners()

  }



  if (gen === preGenGen && preGenQueue.length < maxRounds && !lastIsBranch) {

    void fillPreGenQueue(promptTemplate, sessionId)

  }

}


