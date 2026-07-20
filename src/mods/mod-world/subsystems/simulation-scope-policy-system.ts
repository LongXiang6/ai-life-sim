/**
 * SimulationScopePolicySystem
 *
 * 职责：拥有 active/background/dormant/closed 范围与当地时钟同步策略。
 * 非职责：不推进规范全局时间、不执行未来后台聚合系统。
 * 输入：RoundContext 规范时间与明确范围变更。
 * 输出与写入：上下文 scope/localClock。
 * AI 参与：只读。
 * 状态权威：mod-world Store。
 * 持久化权威：world Store。
 * 运行存活：mod-world manifest 与 MVP runtime policy。
 */

import { BaseSubsystem } from '@/core/subsystem-base'
import type { RoundContext, SimulationScope, SubSystemChanges, SubSystemState } from '@/foundation'

import { useWorldStore } from '../store'
import { syncLocalClock } from '../utils/world-context-runtime'

export class SimulationScopePolicySystem extends BaseSubsystem {
  readonly id = 'simulation-scope-policy' as const
  readonly mod = 'mod-world' as const
  readonly label = '模拟范围策略' as const
  readonly description = '决定当前完整模拟、后台聚合、休眠冻结和关闭状态' as const

  setScope(contextId: string, scope: SimulationScope, reason: string, globalTotalDays: number): void {
    const state = useWorldStore.getState()
    const instance = state.contexts[contextId]
    if (!instance) throw new Error(`未知上下文：${contextId}`)
    if (scope === 'active' && state.currentContextId !== contextId) {
      throw new Error('只有当前上下文可以设为 active')
    }
    if (state.currentContextId === contextId && scope !== 'active') {
      throw new Error('当前上下文必须保持 active；离开当前上下文只能通过上下文切换系统')
    }
    if (instance.scope.scope === 'closed' && scope !== 'closed') {
      throw new Error('已关闭上下文不能重新开放')
    }
    const next = syncLocalClock(instance, globalTotalDays)
    next.scope = { contextId, scope, reason, changedAtGlobalDay: globalTotalDays }
    next.record.lifecycle = scope === 'closed' ? 'closed' : scope === 'dormant' ? 'dormant' : 'open'
    state.replaceContext(next)
  }

  canRunFullRound(contextId: string): boolean {
    return useWorldStore.getState().contexts[contextId]?.scope.scope === 'active'
  }

  canRunBackground(contextId: string, subsystemId: string): boolean {
    const instance = useWorldStore.getState().contexts[contextId]
    return instance?.scope.scope === 'background'
      && instance.capabilityProfile.backgroundSubsystemIds.includes(subsystemId)
  }

  advance(context: RoundContext): void {
    const state = useWorldStore.getState()
    const instance = state.contexts[context.contextId]
    if (!instance) return
    state.replaceContext(syncLocalClock(instance, context.totalDays))
  }

  collectState(context: RoundContext): SubSystemState {
    this.advance(context)
    const state = useWorldStore.getState()
    const scopes = Object.fromEntries(
      Object.entries(state.contexts).map(([id, instance]) => [id, instance.scope]),
    )
    return {
      id: this.id,
      summary: `【${this.label}：当前 ${scopes[context.contextId]?.scope ?? '未登记'}，上下文 ${Object.keys(scopes).length}】`,
      data: structuredClone({ scopes }),
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    if (!changes || typeof changes !== 'object') throw new Error(`[${this.id}] Changes must be an object`)
    if (changes.id !== this.id) throw new Error(`[${this.id}] Changes ID mismatch`)
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) {
      throw new Error(`[${this.id}] Changes payload must be a plain object`)
    }
    if (!changes.description || changes.description.trim().length === 0) {
      throw new Error(`[${this.id}] Changes description is required`)
    }
    const requestedChanges = changes.changes
    void requestedChanges
    throw new Error(`[${this.id}] 只读系统不接受叙事 AI 直接写入`)
  }

  reset(): void {}
}

let runtimeSimulationScopePolicySystem: SimulationScopePolicySystem | undefined

export function getSimulationScopePolicySystem(): SimulationScopePolicySystem {
  runtimeSimulationScopePolicySystem ??= new SimulationScopePolicySystem()
  return runtimeSimulationScopePolicySystem
}
