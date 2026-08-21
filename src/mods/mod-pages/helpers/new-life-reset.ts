/**
 * Purpose: Reset active-life runtime state and per-life creation drafts.
 * Owner: mod-pages
 * Responsibility: New-life boundary orchestration only.
 */

import { useGlobalStore } from '@/core/global-store'
import { flushOpfsQueueNow } from '@/core/storage'
import { useCharacterStore } from '@/mods/mod-character'
import { useEngineStore } from '@/mods/mod-engine'
import { orchestrator } from '@/mods/mod-engine/engine-api'
import { usePowerSystemStore } from '@/mods/mod-power-system'
import { useSettingsStore } from '@/mods/mod-settings'
import { useWorldStore } from '@/mods/mod-world'

import { clearNewLifeCreationDrafts } from './creation-draft-storage'

const MOD_RUNTIME_READY_TIMEOUT_MS = 15_000

function waitForModRuntimeReady(): Promise<void> {
  if (useGlobalStore.getState().allModsLoaded) return Promise.resolve()

  return new Promise<void>((resolve, reject) => {
    let settled = false
    const finish = (error?: Error) => {
      if (settled) return
      settled = true
      window.clearTimeout(timeoutId)
      unsubscribe()
      if (error) reject(error)
      else resolve()
    }
    const timeoutId = window.setTimeout(() => {
      finish(new Error('核心模拟系统初始化超时，请刷新页面后重试。'))
    }, MOD_RUNTIME_READY_TIMEOUT_MS)
    const unsubscribe = useGlobalStore.subscribe((state) => {
      if (state.allModsLoaded) finish()
    })

    if (useGlobalStore.getState().allModsLoaded) finish()
  })
}

/** 已经进入正式模拟或仍携带上一局叙事时，世界选择不能继续复用当前 Store。 */
export function hasActiveLifeProgress(): boolean {
  const engine = useEngineStore.getState()
  const runtime = orchestrator.getState()
  const phase = useGlobalStore.getState().gamePhase
  return phase === 'simulation'
    || phase === 'end'
    || engine.totalRounds > 0
    || engine.narrativeHistory.length > 0
    || runtime.totalRounds > 0
    || runtime.narrativeHistory.length > 0
}

/**
 * 新世界确认前关闭两类串线入口：
 * 1. 已经存在正式人生进度；
 * 2. 创建流程返回世界选择后改选了另一个世界。
 *
 * 同一 worldCode 的创建期返回仍复用当前上下文，保留 PD-002 允许的有效选择。
 */
export async function prepareNewLifeWorldCommit(nextWorldCode?: number): Promise<'reset' | 'preserved'> {
  const world = useWorldStore.getState()
  const hasExistingContext = Object.keys(world.contexts).length > 0
  const changesCreationWorld = hasExistingContext
    && (!Number.isFinite(nextWorldCode) || nextWorldCode === undefined || world.worldCode !== nextWorldCode)

  if (!hasActiveLifeProgress() && !changesCreationWorld) {
    // A confirmed world starts a fresh seed scope even when its draft context is reused.
    useSettingsStore.getState().setStorySeed('')
    return 'preserved'
  }

  await resetForNewLife()
  return 'reset'
}

/**
 * 清理当前人生的运行态与创建草稿，不触碰模型设置、跨局神话库或独立存档槽。
 * 必须等待 MOD 运行注册完成，保证 P0/P1 等所有当前活动子系统都参与同一次重置。
 */
export async function resetForNewLife(): Promise<void> {
  await waitForModRuntimeReady()
  orchestrator.reset()
  clearNewLifeCreationDrafts()
  useCharacterStore.getState().reset()
  useSettingsStore.getState().setStorySeed('')
  useWorldStore.getState().reset()
  useEngineStore.getState().reset()
  usePowerSystemStore.getState().reset()
  useGlobalStore.setState({
    gamePhase: 'world_build',
    worldviewId: null,
    worldName: '',
    characterName: '',
  })
  await flushOpfsQueueNow()
}
