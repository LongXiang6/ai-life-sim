/**
 * @module narrative-config.ts
 * @description 叙事偏好配置常量 —— 叙事风格指令、字数范围、压缩参数
 * @mod mod-engine
 *
 * 来源：废弃项目 lib/config/ai/narrative-config.ts
 * 移植原则：用新项目 MOD 架构重新实现，常量归入 mod-engine/constants
 */

// ============================================================
// 叙事风格（4 种）—— Prompt 指令文本
// ============================================================

/** 叙事风格 ID */
export type NarrativeStyleId = 'default' | 'epic' | 'realistic' | 'poetic'

/** 叙事风格 Prompt 指令 */
export const NARRATIVE_STYLE_PROMPTS: Record<NarrativeStyleId, string> = {
  default: '【叙事风格：剧情默认】先根据世界压力、人生阶段和时间跨度选择合理剧情材料，再写角色亲历的具体事件。语言自然克制，优先用事件开场，少用作文式开头、主题升华或年度总结。',
  epic: '【叙事风格：史诗】宏大感优先来自时代压力如何改变角色命运。可以有历史感和象征，但要先选一个足以折射世界格局的具体事件，再写角色在其中的行动、代价与后果。',
  realistic: '【叙事风格：写实】以现实约束、社会规则、人物动机和具体阻力推动剧情。多写行动、对话、手续、资源限制和关系反应；少用报告腔、抒情作文和无因巧合。',
  poetic: '【叙事风格：诗意】意象服务剧情压力和人物选择。可以语言凝练、有画面感，但每段仍尽量推进事件、阻力或后果；少写成散文化独白或纯情绪描写。',
}

// ============================================================
// 字数范围（8 档）
// ============================================================

/** 字数范围选项 */
export interface WordCountRange {
  min: number
  max: number
  label: string,
}

export const WORD_COUNT_RANGES: WordCountRange[] = [
  { min: 50, max: 150, label: '极简（50-150字）', },
  { min: 100, max: 300, label: '简短（100-300字）', },
  { min: 200, max: 500, label: '标准（200-500字）', },
  { min: 300, max: 800, label: '详细（300-800字）', },
  { min: 500, max: 1000, label: '丰富（500-1000字）', },
  { min: 800, max: 1500, label: '长篇（800-1500字）', },
  { min: 1000, max: 2000, label: '史诗（1000-2000字）', },
  { min: 1500, max: 3000, label: '巨著（1500-3000字）', },
]

// ============================================================
// 压缩系统参数
// ============================================================

/**
 * @deprecated 压缩调度的唯一来源是 `../constants.ts`；此兼容导出保持同一数值。
 */
export const SUMMARY_INTERVAL = 10

// ============================================================
// 紧凑 JSON 键名映射（用于压缩 Prompt 中的 JSON 字段名）
// ============================================================

/** 紧凑 JSON 键名映射：短名 → 完整含义 */
export const COMPACT_JSON_KEY_MAP: Record<string, string> = {
  n: 'narrative',
  a: 'attr',
  s: 'stay',
  d: 'direction',
  e: 'events',
  c: 'changes',
  w: 'world',
  r: 'round',
  t: 'tags',
  m: 'morality',
  l: 'luck',
}

// ============================================================
// 辅助函数
// ============================================================

/**
 * 默认每轮叙事字数目标 —— 单一来源常量
 * 所有 wordCountTarget 回退值与 store 初始值均从此派生；它不是输出上限。
 * 改动此处即可全局生效，无需在多个文件中手动同步
 */
export const DEFAULT_WORD_COUNT_TARGET = 200

export interface NarrativeWordCountRange {
  target: number
  preferredMin: number
  preferredMax: number
}

export function resolveNarrativeWordCountRange(target: number): NarrativeWordCountRange {
  const normalizedTarget = Number.isFinite(target)
    ? Math.max(50, Math.round(target))
    : DEFAULT_WORD_COUNT_TARGET
  return {
    target: normalizedTarget,
    preferredMin: Math.max(50, Math.floor(normalizedTarget * 0.75)),
    preferredMax: Math.max(50, Math.ceil(normalizedTarget * 1.3)),
  }
}

/**
 * 根据大致字数生成 Prompt 字数约束文本
 */
export function buildWordCountInstruction(target: number): string {
  const { target: normalizedTarget } = resolveNarrativeWordCountRange(target)
  return [
    `【篇幅提示：玩家偏好约${normalizedTarget}字】仅用于把握节奏，不是硬上限、硬下限或重写条件。`,
    '核心优先级：文笔、人物代入、现场感、因果推进和让玩家想继续下一轮，均高于字数精确度。',
    '根据事件需要自然展开或收束；不要为了凑字重复环境意象，也不要为了压字删掉关键行动、对话、阻力、代价或后果。',
    '完整性要求：第三段优先完成可见后果、新局面或下一轮钩子，正文末尾避免停在未说完的引出句。',
    '文字规范：使用常用简体中文，避免生僻字、异体字、日文新字体或繁体字混入。',
  ].join('\n')
}

/** 废弃项目 NARRATIVE_WORD_COUNT_DEFAULT_MAX */
export const NARRATIVE_WORD_COUNT_DEFAULT_MAX = DEFAULT_WORD_COUNT_TARGET

/**
 * 叙事调用的最低 token 预算。
 *
 * wordCountTarget 只是节奏偏好，不能把低偏好值变成截断上限；预算只负责给
 * 主叙事与 META 留出足够的技术空间，真正的输出长度由 Prompt、模型和 Provider
 * 上下文窗口共同决定。更高的偏好仍可扩大预算，但不会缩小故事可用空间。
 */
export const NARRATIVE_MIN_TOKEN_BUDGET = 8_192

/**
 * 叙事 maxTokens 计算 —— 字数偏好只影响额外余量，不作为正文质量门禁或硬上限。
 */
export function computeNarrativeMaxTokens(wordCountTarget: number): number {
  const normalizedTarget = Number.isFinite(wordCountTarget)
    ? Math.max(50, Math.round(wordCountTarget))
    : DEFAULT_WORD_COUNT_TARGET
  return Math.max(NARRATIVE_MIN_TOKEN_BUDGET, Math.ceil(normalizedTarget * 5) + 2_000)
}

/**
 * 根据叙事风格生成 Prompt 风格指令
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
