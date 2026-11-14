/**
 * Purpose: Define player-selectable narrative style and length guidance.
 * Owner: mod-engine
 * Responsibility: Narrative preference constants only; Prompt assembly owns their placement.
 */

import {
  DEFAULT_WORD_COUNT_TARGET,
  resolveNarrativeWordCountTarget,
  type NarrativeWordCountTarget,
} from '@/foundation'

// ============================================================
// 历史叙事风格映射（仅供旧存档迁移；运行时只消费用户保存的自定义文本）
// ============================================================

/** 叙事风格 ID */
export type NarrativeStyleId = 'default' | 'epic' | 'realistic' | 'poetic'

/** 旧版叙事风格 Prompt 指令；default 保持为空，不能作为运行时回退。 */
export const NARRATIVE_STYLE_PROMPTS: Record<NarrativeStyleId, string> = {
  default: '',
  epic: '【叙事风格：史诗】宏大感来自时代格局与角色命运之间可追踪的联系。可以有历史感和象征，但必须服从当前时间尺度：日级选择足以折射格局的具体事件，长跨度选择前后承接的时代节点，再写角色或其延续主体的行动与结果。',
  realistic: '【叙事风格：写实】以现实条件、社会规则和人物动机推进剧情。多写行动、对话、手续、资源状况和关系反应；少用报告腔、抒情作文和无因巧合。',
  poetic: '【叙事风格：诗意】意象服务已经发生的剧情变化和人物选择。可以语言凝练、有画面感，但每段仍尽量推进事件、关系或结果；少写成散文化独白或纯情绪描写。',
}

// ============================================================
// 紧凑 JSON 键名映射（用于压缩 Prompt 中的 JSON 字段名）
// ============================================================

/** 紧凑 JSON 键名映射：短名 → 完整含义 */
export const COMPACT_JSON_KEY_MAP: Record<string, string> = {
  n: 'narrative',
  a: 'attr',
  s: 'stay',
  e: 'events',
  c: 'changes',
  w: 'world',
  r: 'round',
  t: 'tags',
  l: 'luck',
}

// ============================================================
// 辅助函数
// ============================================================

export interface NarrativeWordCountRange {
  target: NarrativeWordCountTarget
  preferredMin: number
  preferredMax: number
}

export function resolveNarrativeWordCountRange(target: unknown): NarrativeWordCountRange {
  const normalizedTarget = resolveNarrativeWordCountTarget(target)
  return {
    target: normalizedTarget,
    preferredMin: Math.max(1, Math.floor(normalizedTarget * 0.8)),
    preferredMax: Math.ceil(normalizedTarget * 1.2),
  }
}

/**
 * 根据玩家偏好生成宽松的字数目标，不规定段落、句数或叙事节拍。
 */
export function buildWordCountInstruction(target: NarrativeWordCountTarget): string {
  const normalizedTarget = resolveNarrativeWordCountTarget(target)
  return `正文约${normalizedTarget}字。`
}

export { DEFAULT_WORD_COUNT_TARGET }

/**
 * 读取旧版叙事风格映射；主叙事运行时不调用此函数作为文风回退。
 */
export function buildStyleInstruction(style: NarrativeStyleId): string {
  return NARRATIVE_STYLE_PROMPTS[style] || ''
}

/** 与 world-tag-defaults TAG_VALUE_ZH_MAP.narrativeTone 对齐（避免 mod-engine→mod-world 循环依赖） */
const NARRATIVE_TONE_ZH: Record<string, string> = {
  realistic: '写实基调',
  heroic: '英雄史诗',
  horror: '恐怖基调',
  epic: '宏大史诗',
  mystery: '悬疑神秘',
  historical: '历史纪实',
  speculative: '思辨推演',
  grim: '灰暗压抑',
  wuxia: '武侠江湖',
  mixed: '混合基调',
}

/** 将 calibration styleGuide.narrativeTone 映射为叙事 stable 段提示。 */
export function resolveNarrativeToneHint(tone: string | undefined): string | undefined {
  const raw = tone?.trim()
  if (!raw) return undefined
  return NARRATIVE_TONE_ZH[raw] ?? raw
}
