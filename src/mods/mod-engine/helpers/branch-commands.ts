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
export function resolveNarrativeBranchChoice(
  branchId: string,
  choice: string,
): { ok: boolean; error?: string } {
  const trimmed = choice.trim()
  if (!branchId || !trimmed) {
    return { ok: false, error: !branchId ? '分支数据异常，请尝试刷新页面' : '请先选择一个选项或写下你的做法' }
  }

  const store = useEngineStore.getState()

  const branchEntry = store.narrativeHistory.find((entry) => (
    entry.id === branchId
      && entry.isBranchPoint === true
      && entry.resolvedChoice === undefined
  ))
  if (!branchEntry) {
    return { ok: false, error: '当前分支已失效，请重新选择或等待新的分支出现' }
  }

  store.resolveBranch(branchId, trimmed)
  orchestrator.resolveBranchChoice(branchId, trimmed)
  orchestrator.setLastPlayerChoice(trimmed)
  clearPreGenQueue()
  useEngineStore.getState().setForceBranchNext(false)
  return { ok: true }
}
