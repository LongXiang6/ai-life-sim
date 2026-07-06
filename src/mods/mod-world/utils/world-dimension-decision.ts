/**
 * @module world-dimension-decision.ts
 * @description 世界四维度轻量 AI 决策 —— 只判断空间形态/世界观本质/力量体系/力量上限，并按 worldCode 缓存
 * @mod mod-world
 */

import { z } from 'zod'

import { callAI, configStore } from '@/core'
import { estimateTokenBudget, stringifyPrompt } from '@/foundation'
import { useSettingsStore } from '@/mods/mod-settings'
import { parseAIJSON } from './parse-ai-json'

const WORLD_DIMENSION_DECISION_CACHE_VERSION = 1

export const WORLD_DIMENSION_DECISION_KEYS = [
  'universeScale',
  'worldviewEssence',
  'powerSystem',
  'powerCeiling',
] as const

export type WorldDimensionDecisionKey = typeof WORLD_DIMENSION_DECISION_KEYS[number]
export type WorldDimensionMode = 'ai' | 'adaptive' | 'custom'

export interface WorldDimensionDecisionInput {
  worldCode: number
  worldName: string
  worldDescription: string
  modes: Record<string, WorldDimensionMode>
  values: Record<string, string>
}

export interface WorldDimensionDecision {
  universeScale: string
  worldviewEssence: string
  powerSystem: string
  powerCeiling: number
}

interface CachedWorldDimensionDecision {
  version: number
  fingerprint: string
  decision: WorldDimensionDecision
  cachedAt: number
}

const worldDimensionDecisionSchema = z.object({
  universeScale: z.enum(['位面', '宇宙', '位面晶壁群系', '多元宇宙群系', '诸天万界']),
  worldviewEssence: z.enum(['唯物主义', '唯心主义', '唯物修仙', '唯心修仙', '混合']),
  powerSystem: z.enum(['无', '修仙', '魔法', '灵能', '科技', '异能', '混合']),
  powerCeiling: z.coerce.number().int().min(1).max(24),
})

const SYSTEM_PROMPT = stringifyPrompt({
  role: '世界四维度决策 AI',
  task: '只判断世界空间形态、世界观本质、力量体系、力量上限四个属性，输出纯 JSON。',
  rules: [
    '玩家模式为 用户选择/用户自定义 的字段必须严格沿用玩家值。',
    '玩家模式为 AI决定 的字段，依据世界描述选择最合理值。',
    '力量上限必须是 1-24 的整数，且应与世界空间形态和力量体系匹配。',
    '禁止输出解释、markdown、额外字段。',
  ],
  options: {
    universeScale: ['位面', '宇宙', '位面晶壁群系', '多元宇宙群系', '诸天万界'],
    worldviewEssence: ['唯物主义', '唯心主义', '唯物修仙', '唯心修仙', '混合'],
    powerSystem: ['无', '修仙', '魔法', '灵能', '科技', '异能', '混合'],
    powerCeiling: '1-24',
  },
  outputFormat: '{ "universeScale": "...", "worldviewEssence": "...", "powerSystem": "...", "powerCeiling": 8 }',
})

function cacheKey(worldCode: number): string {
  return `world-dimension-decision:${worldCode || 0}`
}

function buildFingerprint(input: WorldDimensionDecisionInput): string {
  return JSON.stringify({
    version: WORLD_DIMENSION_DECISION_CACHE_VERSION,
    worldName: input.worldName,
    worldDescription: input.worldDescription.trim(),
    modes: Object.fromEntries(WORLD_DIMENSION_DECISION_KEYS.map((k) => [k, input.modes[k] ?? 'ai'])),
    values: Object.fromEntries(WORLD_DIMENSION_DECISION_KEYS.map((k) => [k, input.values[k] ?? ''])),
  })
}

function normalizeManualDecision(input: WorldDimensionDecisionInput): Partial<WorldDimensionDecision> {
  const result: Partial<WorldDimensionDecision> = {}
  for (const key of WORLD_DIMENSION_DECISION_KEYS) {
    const mode = input.modes[key] ?? 'ai'
    const value = input.values[key]?.trim()
    if (mode === 'ai' || !value) continue
    if (key === 'powerCeiling') {
      const parsed = parseInt(value.match(/^(\d+)/)?.[1] ?? '', 10)
      if (Number.isFinite(parsed)) result.powerCeiling = parsed
    } else if (key === 'universeScale') {
      result.universeScale = value
    } else if (key === 'worldviewEssence') {
      result.worldviewEssence = value
    } else if (key === 'powerSystem') {
      result.powerSystem = value
    }
  }
  return result
}

function buildUserPrompt(input: WorldDimensionDecisionInput): string {
  const modeLabel = (mode: WorldDimensionMode | undefined): string => {
    if (mode === 'adaptive') return '用户选择'
    if (mode === 'custom') return '用户自定义'
    return 'AI决定'
  }

  const dimensions = Object.fromEntries(
    WORLD_DIMENSION_DECISION_KEYS.map((key) => [
      key,
      {
        mode: modeLabel(input.modes[key]),
        value: input.values[key] || '',
      },
    ]),
  )

  return stringifyPrompt({
    worldName: input.worldName,
    worldDescription: input.worldDescription || '（无详细描述）',
    dimensions,
  })
}

function loadCachedDecision(worldCode: number): WorldDimensionDecision | null {
  const cached = configStore.get<CachedWorldDimensionDecision>('mod-world', cacheKey(worldCode))
  if (!cached || cached.version !== WORLD_DIMENSION_DECISION_CACHE_VERSION) return null
  return cached.decision
}

function saveCachedDecision(worldCode: number, fingerprint: string, decision: WorldDimensionDecision): void {
  if (!worldCode) return
  configStore.set<CachedWorldDimensionDecision>('mod-world', cacheKey(worldCode), {
    version: WORLD_DIMENSION_DECISION_CACHE_VERSION,
    fingerprint,
    decision,
    cachedAt: Date.now(),
  })
}

function clampDecision(decision: WorldDimensionDecision): WorldDimensionDecision {
  return {
    ...decision,
    powerCeiling: Math.max(1, Math.min(24, Math.floor(decision.powerCeiling))),
  }
}

export function hasAIDimensionMode(modes: Record<string, WorldDimensionMode>): boolean {
  return WORLD_DIMENSION_DECISION_KEYS.some((key) => (modes[key] ?? 'ai') === 'ai')
}

/**
 * 解析世界四维度决策。
 *
 * 上游：world-customize 页面提交四个字段的 AI/玩家模式。
 * 下游：WorldConfig 映射与本地世界初始化。
 * 设计：只有 AI决定字段触发轻量调用；玩家选择/自定义字段直接透传，并与 AI 结果一起缓存复用。
 */
export async function resolveWorldDimensionDecision(
  input: WorldDimensionDecisionInput,
): Promise<{ decision: WorldDimensionDecision; fromCache: boolean }> {
  const manual = normalizeManualDecision(input)
  const fallback: WorldDimensionDecision = clampDecision({
    universeScale: manual.universeScale ?? '宇宙',
    worldviewEssence: manual.worldviewEssence ?? '唯心主义',
    powerSystem: manual.powerSystem ?? '修仙',
    powerCeiling: manual.powerCeiling ?? 8,
  })

  const fingerprint = buildFingerprint(input)
  const cached = loadCachedDecision(input.worldCode)
  if (cached) return { decision: clampDecision({ ...cached, ...manual }), fromCache: true }

  if (!hasAIDimensionMode(input.modes)) {
    saveCachedDecision(input.worldCode, fingerprint, fallback)
    return { decision: fallback, fromCache: false }
  }

  const { customKey, provider, customUrl, customModel } = useSettingsStore.getState()
  if (!customKey) {
    saveCachedDecision(input.worldCode, fingerprint, fallback)
    return { decision: fallback, fromCache: false }
  }

  const userPrompt = buildUserPrompt(input)
  const model = customModel || 'deepseek-v4-flash'
  const maxTokens = estimateTokenBudget(SYSTEM_PROMPT, userPrompt, 256, 512)
  const raw = await callAI(SYSTEM_PROMPT, userPrompt, {
    config: {
      model,
      temperature: 0.2,
      maxTokens,
      responseFormat: { type: 'json_object' },
      reasoningEffort: 'disabled',
      stream: false,
    },
    pool: 'worldInit',
    sessionId: `dimension-${input.worldCode || 0}`,
    jsonMode: true,
    providerId: provider,
    apiKey: customKey,
    customBaseUrl: customUrl || undefined,
    customModel: model,
    overrideMaxTokens: maxTokens,
    logContext: {
      trigger: 'world-customize/dimension-decision',
      pool: 'worldInit',
      model,
      sessionId: `dimension-${input.worldCode || 0}`,
    },
    outputSchema: worldDimensionDecisionSchema,
  })

  const parsedJson = parseAIJSON<unknown>(raw)
  const parsed = worldDimensionDecisionSchema.safeParse(parsedJson)
  const aiDecision = parsed.success ? parsed.data : fallback
  const decision = clampDecision({ ...aiDecision, ...manual })
  saveCachedDecision(input.worldCode, fingerprint, decision)
  return { decision, fromCache: false }
}
