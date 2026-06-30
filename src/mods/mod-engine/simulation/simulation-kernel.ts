/**
 * @module simulation-kernel.ts
 * @description 纯函数模拟内核 —— 可运行于 Worker 或主线程
 * @mod mod-engine
 */

import {
  registerAllRules,
  type CrossDomainRule,
  type DomainEvent,
  type SubsystemInstruction,
} from '../helpers/cross-domain-rules'
import { validateCrossDomainChanges } from '../helpers/cross-domain-change-validator'
import type { SubSystemChanges } from '@/foundation'

const SORTED_RULES: CrossDomainRule[] = registerAllRules().sort(
  (a: CrossDomainRule, b: CrossDomainRule) => b.priority - a.priority,
)

function matchPattern(eventType: string, pattern: string): boolean {
  if (pattern === '*') return true
  if (pattern.endsWith('*')) {
    return eventType.startsWith(pattern.slice(0, -1))
  }
  return eventType === pattern
}

export interface CrossDomainEvalInput {
  event: DomainEvent
  subsystemStates?: Record<string, unknown>
  round: number
  cooldowns: Record<string, number>
}

export interface CrossDomainEvalResult {
  instructions: SubsystemInstruction[]
  cooldowns: Record<string, number>
}

/**
 * 评估跨域联动规则（无副作用，冷却表由调用方传入/取回）
 */
export function evaluateCrossDomainDispatch(input: CrossDomainEvalInput): CrossDomainEvalResult {
  const cooldowns = { ...input.cooldowns }
  const instructions: SubsystemInstruction[] = []

  for (const rule of SORTED_RULES) {
    if (!matchPattern(input.event.type, rule.eventTypePattern)) continue

    if (rule.dataCondition) {
      if (!input.subsystemStates || !rule.dataCondition(input.subsystemStates)) continue
    } else if (!rule.condition(input.event)) {
      continue
    }

    if (rule.cooldownRounds && rule.cooldownRounds > 0) {
      const lastTriggered = cooldowns[rule.id] ?? -Infinity
      if (input.round - lastTriggered < rule.cooldownRounds) continue
    }

    try {
      const result = rule.handler(input.event, input.subsystemStates)
      instructions.push(...result)
      if (rule.cooldownRounds && rule.cooldownRounds > 0) {
        cooldowns[rule.id] = input.round
      }
    } catch {
      // 单条规则失败不影响其余规则
    }
  }

  return { instructions, cooldowns }
}

export function validateCrossDomainChangesInKernel(
  changes: SubSystemChanges[],
): SubSystemChanges[] {
  return validateCrossDomainChanges(changes)
}

export function instructionsToChanges(
  instructions: SubsystemInstruction[],
  sourceEventId: string,
): SubSystemChanges[] {
  return instructions.map((inst) => ({
    id: inst.targetSystemId,
    description: `跨域联动: ${inst.action} (来源事件: ${sourceEventId})`,
    changes: inst.params,
  }))
}
