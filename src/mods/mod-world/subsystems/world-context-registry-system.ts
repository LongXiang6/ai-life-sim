/**
 * WorldContextRegistrySystem
 *
 * 职责：拥有存档级世界上下文目录、当前上下文引用与生命周期入口。
 * 非职责：不拥有空间边、切换原子性、规范时间或叙事提交。
 * 输入：WorldContextInstance、生命周期请求、RoundContext。
 * 输出与写入：useWorldStore.contexts/currentContextId 与只读状态卡。
 * AI 参与：只读。
 * 状态权威：useWorldStore 的完整上下文注册表。
 * 持久化权威：world Store + save/restore 聚合。
 * 运行存活：mod-world manifest 与 MVP runtime policy。
 */

import { BaseSubsystem } from '@/core/subsystem-base'
import type { RoundContext, SubSystemChanges, SubSystemState } from '@/foundation'

import { useWorldStore } from '../store'
import type { WorldContextInstance } from '../types'
import { assertValidWorldContextHierarchy } from '../utils/world-context-runtime'

export class WorldContextRegistrySystem extends BaseSubsystem {
  readonly id = 'world-context-registry' as const
  readonly mod = 'mod-world' as const
  readonly label = '世界上下文注册表' as const
  readonly description = '管理世界、星球、区域和场景上下文的稳定身份、层级与生命周期' as const

  validateContextParent(contextId: string, parentContextId?: string): void {
    if (!parentContextId) return
    if (parentContextId === contextId) {
      throw new Error(`上下文不能以自身为父级：${contextId}`)
    }

    const contexts = useWorldStore.getState().contexts
    if (!contexts[parentContextId]) {
      throw new Error(`父上下文不存在：${parentContextId}`)
    }

    const visited = new Set<string>()
    let cursor: string | undefined = parentContextId
    while (cursor) {
      if (cursor === contextId) throw new Error(`上下文父子关系存在环：${contextId}`)
      if (visited.has(cursor)) throw new Error(`现有上下文父子关系存在环：${cursor}`)
      visited.add(cursor)
      cursor = contexts[cursor]?.record.parentContextId
    }
  }

  registerContext(instance: WorldContextInstance, makeActive = false): void {
    const state = useWorldStore.getState()
    const existing = state.contexts[instance.record.id]
    if (existing && state.currentContextId !== instance.record.id) {
      throw new Error(`上下文 ID 冲突：${instance.record.id}`)
    }
    this.validateContextParent(instance.record.id, instance.record.parentContextId)
    const records = Object.fromEntries(
      Object.entries(state.contexts).map(([id, context]) => [id, structuredClone(context.record)]),
    )
    records[instance.record.id] = structuredClone(instance.record)
    assertValidWorldContextHierarchy(records)
    state.registerContext(instance, makeActive)
  }

  getContext(contextId: string): WorldContextInstance | null {
    const instance = useWorldStore.getState().contexts[contextId]
    return instance ? structuredClone(instance) : null
  }

  getCurrentContext(): WorldContextInstance | null {
    const state = useWorldStore.getState()
    const instance = state.currentContextId ? state.contexts[state.currentContextId] : undefined
    return instance ? structuredClone(instance) : null
  }

  collectState(_context: RoundContext): SubSystemState {
    const state = useWorldStore.getState()
    const contexts = Object.fromEntries(
      Object.entries(state.contexts).map(([id, instance]) => [id, structuredClone(instance.record)]),
    )
    return {
      id: this.id,
      summary: `【${this.label}：上下文 ${Object.keys(contexts).length} | 当前 ${state.currentContextId ?? '无'}】`,
      data: structuredClone({ currentContextId: state.currentContextId, contexts }),
    }
  }

  applyChanges(changes: SubSystemChanges, _context: RoundContext): void {
    if (!changes || typeof changes !== 'object') {
      throw new Error(`[${this.id}] Invalid changes: expected object`)
    }
    if (changes.id !== this.id) throw new Error(`[${this.id}] Changes ID mismatch`)
    if (!changes.changes || typeof changes.changes !== 'object' || Array.isArray(changes.changes)) {
      throw new Error(`[${this.id}] Invalid changes.changes: expected plain object`)
    }
    if (!changes.description || changes.description.trim() === '') {
      throw new Error(`[${this.id}] Missing changes.description`)
    }
    const c = changes.changes
    void c
    throw new Error(`[${this.id}] 只读系统不接受叙事 AI 直接写入`)
  }

  reset(): void {
    // Store reset 由全局重开流程统一拥有，子系统不得单独清空其他世界。
  }
}

let runtimeWorldContextRegistrySystem: WorldContextRegistrySystem | undefined

export function getWorldContextRegistrySystem(): WorldContextRegistrySystem {
  runtimeWorldContextRegistrySystem ??= new WorldContextRegistrySystem()
  return runtimeWorldContextRegistrySystem
}
