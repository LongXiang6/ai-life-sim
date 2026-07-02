/**
 * @module world-coherence-output-guard.ts
 * @description AI 输出一致性守卫 —— 禁词检测、年份规范化、JSON 截断判定
 * @mod mod-world
 */

import { clamp } from '@/core/shared'

/**
 * 描述表明无外部自然能量（唯心 / 意志体系）
 * 注意：仅作"辅助信号"，不单独触发禁词强制；需与 AI worldType='idealist' 组合判定
 */
const NO_EXTERNAL_ENERGY_RE = /无灵气|无魔力|无.*外部.*自然能量|唯心世界|意志即力量|心相/

/** 外部能量相关禁词（worldDescription 声明无时） */
const EXTERNAL_ENERGY_TERMS = [
  '灵气', '灵石', '灵材', '灵脉', '仙气', '魔力', '法力', '真元', '灵力',
] as const

/** 修仙模板套话（唯心无灵气世界应避免） */
const CULTIVATION_CLICHE_TERMS = [
  '仙帝', '天劫', '飞升浩劫', '灵石矿脉', '散修突破', '域外天魔', '主神空间',
  '灵气潮汐', '混沌至宝', '万族大战', '轮回之劫',
] as const

export interface CoherenceGuardContext {
  worldDescription: string
  worldType?: string
}

/**
 * 是否应对该世界启用外部能量 / 修仙套话禁词检测
 *
 * 必须同时满足：AI 判定 worldType 为 idealist（明确信号），或 worldDescription 中显式表达了：
 * - "无灵气/无魔力/意志即力量"（AI 一致 + 描述关键词 双信号）
 * 仅描述关键词匹配但 AI 给了不同 worldType 时，提示用户确认而非自动执行
 */
export function shouldEnforceIdealistCoherence(ctx: CoherenceGuardContext): boolean {
  if (ctx.worldType === 'idealist') return true
  if (!NO_EXTERNAL_ENERGY_RE.test(ctx.worldDescription)) return false
  // 描述关键词匹配但 AI 未给 idealist worldType：需要双确认（AI 可能有意制造混合设定）
  // 此时仅当 AI 同时给了 idealist_cultivation essence 时才自动执行
  return false
}

/** 扫描文本中的禁词违规项 */
export function detectCoherenceViolations(text: string, ctx: CoherenceGuardContext): string[] {
  if (!text || !shouldEnforceIdealistCoherence(ctx)) return []

  const violations = new Set<string>()
  for (const term of EXTERNAL_ENERGY_TERMS) {
    if (text.includes(term)) violations.add(term)
  }
  for (const term of CULTIVATION_CLICHE_TERMS) {
    if (text.includes(term)) violations.add(term)
  }
  return [...violations]
}

/** 与唯心/无灵气 worldDescription 冲突的氛围标签（world-init AI 易误生成） */
const IDEALIST_FORBIDDEN_TAG_TERMS = [
  '原始纪元', '蛮荒大地', '洪荒黎明', '生命萌芽', '孤独求生',
  '灵气充沛', '仙凡并存', '灵气复苏', '诸侯割据', '地猿', '史前',
] as const

/**
 * 过滤与世界观矛盾的世界标签；过滤后不足 3 条则保留原数组（避免空标签）。
 */
export function filterCoherentWorldTags(
  tags: string[],
  ctx: CoherenceGuardContext,
): string[] {
  if (!tags.length || !shouldEnforceIdealistCoherence(ctx)) return tags

  const filtered = tags.filter((tag) => {
    for (const bad of IDEALIST_FORBIDDEN_TAG_TERMS) {
      if (tag.includes(bad)) return false
    }
    for (const term of EXTERNAL_ENERGY_TERMS) {
      if (tag.includes(term)) return false
    }
    return true
  })

  return filtered.length >= 3 ? filtered : tags
}

/** 过去史年份窗口：按校准策略与文明阶段；有公元锚点时扩大相对年跨度 */
export function resolvePastHistoryYearRange(opts: {
  civilizationStage: string
  spatialForm: string
  eventDistributionStrategy?: string
  anchorYear?: number
}): { minYear: number; maxYear: number } {
  const strategy = opts.eventDistributionStrategy ?? 'balanced'
  const anchor = opts.anchorYear ?? 0

  if (strategy === 'prehistoric') {
    return { minYear: -100_000, maxYear: -1 }
  }
  // 现代/未来文明阶段：相对锚定年的过去窗口（负年 = 纪元元年前）
  if (['modern', 'information', 'space', 'future'].includes(opts.civilizationStage)) {
    if (anchor > 500) {
      const cap = strategy === 'cosmic_epic' ? 50_000 : 5000
      const span = Math.min(anchor - 1, cap)
      return { minYear: -span, maxYear: -1 }
    }
    if (strategy === 'cosmic_epic' || opts.spatialForm === 'universe' || opts.spatialForm === 'multiverse') {
      return { minYear: -20_000, maxYear: -1 }
    }
    return { minYear: -200, maxYear: -1 }
  }
  if (strategy === 'cosmic_epic' || opts.spatialForm === 'universe' || opts.spatialForm === 'multiverse') {
    return { minYear: -20_000, maxYear: -1 }
  }
  if (strategy === 'mystical') {
    return { minYear: -5_000, maxYear: -1 }
  }
  if (['medieval', 'ancient', 'renaissance'].includes(opts.civilizationStage)) {
    return { minYear: -3_000, maxYear: -1 }
  }
  return { minYear: -500, maxYear: -1 }
}

/**
 * 构建一致性提示
 *
 * 设计理念：AI 通过 worldDescription 已充分理解世界观约束。
 * 仅在检测到明确不一致时提供"轻提示"（非强制的重写指令），
 * 让 AI 自行判断如何调整。
 */
export function buildCoherenceRetryHint(violations: string[]): string {
  if (violations.length === 0) return ''
  return [
    '【友好提示】本次描述若出现以下术语，可能与 worldDescription 的整体设定不够匹配，可选择性调整：',
    violations.join('、'),
    '请以 worldDescription 为最终依据决定是否采纳以上提示。',
  ].join('\n')
}

/** 过去史年份规范化：统一为负整数，落在 [minYear, maxYear] */
export function normalizePastHistoryYear(
  year: number | undefined,
  index: number,
  total: number,
  minYear: number,
  maxYear: number,
): number {
  const fallback = Math.round(minYear + (index * (maxYear - minYear)) / Math.max(total, 1))

  if (typeof year !== 'number' || !Number.isFinite(year)) {
    return fallback
  }

  let normalized = year
  // 正数：若像绝对纪年（>500），转为相对纪元元年的负偏移（由调用方传入 anchor 时在 ingest 层处理）
  if (normalized > 0) {
    normalized = -Math.abs(normalized)
  }

  normalized = Math.round(normalized)
  if (normalized > maxYear) normalized = maxYear
  if (normalized < minYear) normalized = minYear
  return normalized
}

/** 检测 JSON 字符串是否可能因截断而不完整 */
export function isLikelyTruncatedJSON(raw: string): boolean {
  const trimmed = raw.trim()
  if (!trimmed) return true

  const cleaned = trimmed.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim()
  if (!cleaned) return true

  let depth = 0
  let inString = false
  let escapeNext = false

  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i]

    if (escapeNext) {
      escapeNext = false
      continue
    }
    if (ch === '\\') {
      escapeNext = true
      continue
    }
    if (ch === '"') {
      inString = !inString
      continue
    }
    if (inString) continue

    if (ch === '{' || ch === '[') depth++
    else if (ch === '}' || ch === ']') depth = clamp(depth - 1, 0, Infinity)
  }

  if (depth > 0) return true
  if (inString) return true

  const lastChar = cleaned[cleaned.length - 1]
  if (lastChar !== '}' && lastChar !== ']') return true

  return false
}

/** 校准 JSON 是否错误回写了超长 worldDescription */
export function calibrationEchoesDescription(raw: string, descriptionLength: number): boolean {
  if (descriptionLength < 400) return false
  const match = raw.match(/"worldDescription"\s*:\s*"/)
  if (!match) return false
  const start = match.index ?? 0
  const slice = raw.slice(start, start + descriptionLength + 80)
  return slice.length > descriptionLength * 0.5
}
