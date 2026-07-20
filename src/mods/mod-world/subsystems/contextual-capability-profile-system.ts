/**
 * ContextualCapabilityProfileSystem
 *
 * 职责：拥有每个上下文的能力画像和系统组合选择。
 * 非职责：不注册运行系统、不唤醒休眠世界、不执行世界观模拟。
 * 输入：结构化 WorldConfig 与确认后的上下文事实。
 * 输出与写入：WorldContextInstance.capabilityProfile。
 * AI 参与：只读；语义候选必须由本地规则确认。
 * 状态权威：mod-world Store 中各上下文实例。
 * 持久化权威：world Store。
 * 运行存活：mod-world manifest 与 MVP runtime policy。
 */

import { BaseSubsystem } from '@/core/subsystem-base'
import type { ContextCapabilityProfile, RoundContext, SubSystemChanges, SubSystemState } from '@/foundation'

import { useWorldStore } from '../store'
import { deriveCapabilityProfile } from '../utils/world-context-runtime'

export class ContextualCapabilityProfileSystem extends BaseSubsystem {
  readonly id = 'contextual-capability-profile' as const
  readonly mod = 'mod-world' as const
  readonly label = '上下文能力画像' as const
  readonly description = '声明每个上下文具备的生命、空间、社会、科技和超凡能力及可运行系统组合' as const

  refreshProfile(contextId: string): ContextCapabilityProfile {
    const state = useWorldStore.getState()
    const instance = state.contexts[contextId]
    if (!instance) throw new Error(`未知上下文：${contextId}`)
    const confirmedCapabilities = instance.capabilityProfile.derivedFrom === 'confirmed-facts'
      ? instance.capabilityProfile.capabilities
      : undefined
    const capabilityProfile = deriveCapabilityProfile(
      contextId,
      instance.worldConfig,
      instance.capabilityProfile.derivedFrom,
      confirmedCapabilities,
    )
    state.replaceContext({ ...instance, capabilityProfile })
    return structuredClone(capabilityProfile)
  }

  collectState(_context: RoundContext): SubSystemState {
    const state = useWorldStore.getState()
    const profiles = Object.fromEntries(
      Object.entries(state.contexts).map(([id, instance]) => [id, structuredClone(instance.capabilityProfile)]),
    )
    const current = state.currentContextId ? profiles[state.currentContextId] : undefined
    return {
      id: this.id,
      summary: `【${this.label}：${current?.capabilities.join('、') || '未建立'}】`,
      data: structuredClone({ profiles }),
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

  reset(): void {}
}

let runtimeContextualCapabilityProfileSystem: ContextualCapabilityProfileSystem | undefined

export function getContextualCapabilityProfileSystem(): ContextualCapabilityProfileSystem {
  runtimeContextualCapabilityProfileSystem ??= new ContextualCapabilityProfileSystem()
  return runtimeContextualCapabilityProfileSystem
}
