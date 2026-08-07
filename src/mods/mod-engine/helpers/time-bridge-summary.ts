/**
 * @module time-bridge-summary.ts
 * @description 大步进时间桥接摘要（TS-5）—— 本地规则生成，零 API
 * @mod mod-engine
 */

import { BRIDGE_SUMMARY_MIN_TICKS } from '@/core/ai-service/prompt-flags'

/** 关键叙事快照；仅保留当前仍有独立推进意义的修炼状态。 */
export interface BridgeSnapshot {
  cultivationRealm?: string
}

export interface TimeBridgeInput {
  fromYear: number
  toYear: number
  tickCount: number
  prevSnapshot: BridgeSnapshot
  currentSnapshot: BridgeSnapshot
  memoryL0Titles: string[]
}

/** 从子系统状态提取 bridge 对比快照 */
export function extractBridgeSnapshot(
  states: Record<string, { data?: unknown }>,
): BridgeSnapshot {
  const cultData = states['cultivation']?.data as { realmLabel?: string } | undefined

  return {
    cultivationRealm: cultData?.realmLabel,
  }
}

/**
 * 构建大步进 bridge 摘要文本
 *
 * 触发：simulationTicks >= BRIDGE_SUMMARY_MIN_TICKS 且 toYear > fromYear
 */
export function buildTimeBridgeSummary(input: TimeBridgeInput): string | undefined {
  if (input.tickCount < BRIDGE_SUMMARY_MIN_TICKS) return undefined
  if (input.toYear <= input.fromYear) return undefined

  const bullets: string[] = []

  const { prevSnapshot, currentSnapshot } = input

  if (
    prevSnapshot.cultivationRealm
    && currentSnapshot.cultivationRealm
    && prevSnapshot.cultivationRealm !== currentSnapshot.cultivationRealm
  ) {
    bullets.push(`修炼：${prevSnapshot.cultivationRealm}→${currentSnapshot.cultivationRealm}`)
  }

  for (const title of input.memoryL0Titles) {
    if (!title?.trim()) continue
    bullets.push(`记忆：${title.trim()}`)
  }

  if (bullets.length === 0) return undefined

  return [
    `【时间跨度摘要】第${input.fromYear}年→第${input.toYear}年（${input.tickCount}年）`,
    ...bullets.map((b) => `- ${b}`),
  ].join('\n')
}
