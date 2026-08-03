/**
 * Purpose: Advance NPC background and dormant catch-up behavior records for one round.
 * Owner: mod-npc
 * Responsibility: Append deterministic autonomous behavior records without handling commands or projections.
 */

import type { NpcBehaviorRecord, RoundContext } from '@/foundation'
import {
  canRunBackgroundWorldSubsystem,
  contextHasCapability,
  listWorldContexts,
} from '@/mods/mod-world'

import { useNpcSystemStore } from '../../store'

export function advanceNpcSystem(context: RoundContext): void {
  const state = useNpcSystemStore.getState()
  const appended: NpcBehaviorRecord[] = []
  for (const instance of listWorldContexts()) {
    const contextId = instance.record.id
    if (!contextHasCapability(contextId, 'npc')) continue
    if (instance.scope.scope === 'background' && canRunBackgroundWorldSubsystem(contextId, 'npc-system')) {
      for (const goal of state.goals.filter((item) => item.contextId === contextId && item.status === 'active')) {
        const behaviorId = `npc-background:${encodeURIComponent(goal.npcId)}:${encodeURIComponent(contextId)}:${context.totalDays}:${encodeURIComponent(goal.goalId)}`
        if (state.behaviorRecords.some((item) => item.behaviorId === behaviorId)) continue
        appended.push({
          behaviorId,
          npcId: goal.npcId,
          contextId,
          operation: 'background-progress',
          description: `围绕目标“${goal.description}”进行后台进展观察`,
          targetEntityIds: [...goal.targetEntityIds],
          occurredAtTotalDays: context.totalDays,
          historicalEventIds: [],
          source: 'background-aggregate',
        })
      }
    }
    if (instance.scope.scope === 'active'
      && instance.scope.reason === '角色到达上下文'
      && instance.scope.changedAtGlobalDay < context.totalDays) {
      for (const goal of state.goals.filter((item) => item.contextId === contextId && item.status === 'active')) {
        const behaviorId = `npc-catch-up:${encodeURIComponent(goal.npcId)}:${encodeURIComponent(contextId)}:${instance.scope.changedAtGlobalDay}`
        if (state.behaviorRecords.some((item) => item.behaviorId === behaviorId)) continue
        appended.push({
          behaviorId,
          npcId: goal.npcId,
          contextId,
          operation: 'dormant-catch-up',
          description: `根据离开后的规范时间完成一次可追踪追赶结果：${goal.description}`,
          targetEntityIds: [...goal.targetEntityIds],
          occurredAtTotalDays: context.totalDays,
          historicalEventIds: [],
          source: 'dormant-catch-up',
        })
      }
    }
  }
  if (appended.length > 0) useNpcSystemStore.setState({ behaviorRecords: [...state.behaviorRecords, ...appended] })
}
