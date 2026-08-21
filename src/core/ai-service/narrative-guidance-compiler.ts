/**
 * Purpose: Compile stable per-round narrative guidance without changing player input.
 * Owner: core:ai-service
 * Responsibility: Deduplicate system guidance and copy the one-shot player action projection only.
 *
 * @module narrative-guidance-compiler.ts
 * @description 将本轮系统引导与玩家分支投影为稳定、可审计的叙事输入
 * @mod core
 */

import type { PromptContext } from '@/foundation'

export interface CompiledNarrativeGuidance {
  /** 已按权威顺序排列并精确去重的本地系统指令。 */
  systemGuidance?: string[]
  /** 玩家原始分支行动；编译器只复制，不改写其任何内容。 */
  playerBranchIntent?: Record<string, unknown>
}

interface GuidanceSource {
  id: string
  order: number
  content?: string
}

export const NARRATIVE_GUIDANCE_SOURCE_DEFINITIONS = [
  { id: 'round-system-guidance', order: 10, contextKey: 'roundSystemGuidanceText' },
  { id: 'dynamic-guidance', order: 20, contextKey: 'narrativeGuidanceText' },
] as const

function compareAscii(left: string, right: string): number {
  if (left === right) return 0
  return left < right ? -1 : 1
}

function normalizeSystemGuidance(value: string): string {
  return value.replace(/\r\n?/gu, '\n').trim()
}

/**
 * 编译进入“本轮引导”的动态内容。
 *
 * 这是纯本地投影：不调用 AI、不截断长度、不持久化结果。系统内容按既定
 * 权威顺序稳定排列，只移除完全相同的非空文本；玩家分支始终保持原始结构。
 */
export function compileNarrativeGuidance(
  context: Pick<
    PromptContext,
    'roundSystemGuidanceText' | 'timeGuideText' | 'narrativeGuidanceText' | 'playerBranchIntent'
  >,
): CompiledNarrativeGuidance {
  const sources: GuidanceSource[] = NARRATIVE_GUIDANCE_SOURCE_DEFINITIONS.map((source) => ({
    id: source.id,
    order: source.order,
    content: context[source.contextKey],
  }))
  const sourceIds = new Set<string>()
  const contents = new Set<string>()
  const systemGuidance: string[] = []

  for (const source of sources.sort((left, right) => left.order - right.order || compareAscii(left.id, right.id))) {
    if (sourceIds.has(source.id)) {
      throw new Error(`叙事引导来源重复：${source.id}`)
    }
    sourceIds.add(source.id)
    if (!source.content) continue

    const content = normalizeSystemGuidance(source.content)
    if (!content || contents.has(content)) continue
    contents.add(content)
    systemGuidance.push(content)
  }

  const playerBranchIntent = context.playerBranchIntent
  return {
    ...(systemGuidance.length > 0 ? { systemGuidance } : {}),
    ...(playerBranchIntent && Object.keys(playerBranchIntent).length > 0
      ? { playerBranchIntent: structuredClone(playerBranchIntent) }
      : {}),
  }
}
