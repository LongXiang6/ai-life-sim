/**
 * @module branch-commands.ts
 * @description 命运分支公开命令 —— 分支状态与预生成失效由引擎统一维护
 * @mod mod-engine
 */

import { useEngineStore } from '../store'
import { orchestrator } from '../subsystems/orchestrator-system'
import { clearPreGenQueue } from './pre-gen-queue'

/** 切换“下轮强制分支”；任何分支意图变化都会使已有预生成失效。 */
export function setForceBranchNextRound(value: boolean): void {
  useEngineStore.getState().setForceBranchNext(value)
  clearPreGenQueue()
}

/** 解决当前叙事分支，并把玩家选择交给 orchestrator 注入下一轮 Prompt。 */
export function resolveNarrativeBranchChoice(branchId: string, choice: string): boolean {
  const trimmed = choice.trim()
  if (!branchId || !trimmed) return false

  const store = useEngineStore.getState()
  const branchEntry = store.narrativeHistory.find((entry) => (
    entry.id === branchId
      && entry.isBranchPoint === true
      && entry.resolvedChoice === undefined
  ))
  if (!branchEntry) return false

  store.resolveBranch(branchId, trimmed)
  orchestrator.resolveBranchChoice(branchId, trimmed)
  orchestrator.setLastPlayerChoice(trimmed)
  clearPreGenQueue()
  useEngineStore.getState().setForceBranchNext(false)
  return true
}
