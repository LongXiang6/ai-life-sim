/**
 * @module time-bridge-summary.ts
 * @description 大步进时间桥接摘要（TS-5）—— 本地规则生成，零 API
 * @mod mod-engine
 */

import { BRIDGE_SUMMARY_MIN_TICKS } from '@/core/ai-service/prompt-flags'

/** 关键子系统数值快照（population / cultivation / wealth） */
export interface BridgeSnapshot {
  population?: number
  cultivationRealm?: string
  wealth?: number
}

export interface TimeBridgeInput {
  fromYear: number
  toYear: number
  tickCount: number
  prevSnapshot: BridgeSnapshot
  currentSnapshot: BridgeSnapshot
  memoryL0Titles: string[]
}

const MAX_BULLETS = 8
const MAX_BULLET_CHARS = 40
const POPULATION_CHANGE_THRESHOLD = 0.05
const WEALTH_CHANGE_THRESHOLD = 0.1

function truncateBullet(text: string): string {
  const trimmed = text.trim()
  if (trimmed.length <= MAX_BULLET_CHARS) return trimmed
  return `${trimmed.slice(0, MAX_BULLET_CHARS - 1)}…`
}

function formatPercent(rate: number): string {
  const pct = Math.round(rate * 100)
  return pct >= 0 ? `+${pct}%` : `${pct}%`
}

/** 从子系统状态提取 bridge 对比快照 */
export function extractBridgeSnapshot(
  states: Record<string, { data?: unknown }>,
): BridgeSnapshot {
  const popData = states['population']?.data as { totalPopulation?: number } | undefined
  const cultData = states['cultivation']?.data as { realmLabel?: string } | undefined
  const econData = states['economy']?.data as {
    currency?: { playerWealth?: number }
    wealth?: number
  } | undefined

  return {
    population: popData?.totalPopulation,
    cultivationRealm: cultData?.realmLabel,
    wealth: econData?.currency?.playerWealth ?? econData?.wealth,
  }
}

/** 从 L0 叙事提取短标题 */
export function extractL0Title(narrative: string): string {
  const line = narrative.split(/[\n。！？]/)[0]?.trim() ?? narrative.trim()
  return truncateBullet(line)
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
    prevSnapshot.population != null
    && currentSnapshot.population != null
    && prevSnapshot.population > 0
  ) {
    const rate = (currentSnapshot.population - prevSnapshot.population) / prevSnapshot.population
    if (Math.abs(rate) >= POPULATION_CHANGE_THRESHOLD) {
      bullets.push(truncateBullet(
        `人口：${prevSnapshot.population}→${currentSnapshot.population}（${formatPercent(rate)}）`,
      ))
    }
  }

  if (
    prevSnapshot.cultivationRealm
    && currentSnapshot.cultivationRealm
    && prevSnapshot.cultivationRealm !== currentSnapshot.cultivationRealm
  ) {
    bullets.push(truncateBullet(
      `修炼：${prevSnapshot.cultivationRealm}→${currentSnapshot.cultivationRealm}`,
    ))
  }

  if (
    prevSnapshot.wealth != null
    && currentSnapshot.wealth != null
    && prevSnapshot.wealth > 0
  ) {
    const rate = (currentSnapshot.wealth - prevSnapshot.wealth) / prevSnapshot.wealth
    if (Math.abs(rate) >= WEALTH_CHANGE_THRESHOLD) {
      bullets.push(truncateBullet(
        `财富：${Math.round(prevSnapshot.wealth)}→${Math.round(currentSnapshot.wealth)}（${formatPercent(rate)}）`,
      ))
    }
  }

  for (const title of input.memoryL0Titles) {
    if (!title?.trim()) continue
    bullets.push(truncateBullet(`记忆：${title}`))
    if (bullets.length >= MAX_BULLETS) break
  }

  if (bullets.length === 0) return undefined

  const capped = bullets.slice(0, MAX_BULLETS)
  return [
    `【时间跨度摘要】第${input.fromYear}年→第${input.toYear}年（${input.tickCount}年）`,
    ...capped.map((b) => `- ${b}`),
  ].join('\n')
}
