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
  default: '',
  epic: '【叙事风格：史诗】使用宏大叙事语气，强调命运的壮阔与历史的厚重感。场景描写要有气势，人物行为要有深远的意义。适当使用比喻和象征手法。',
  realistic: '【叙事风格：写实】贴近现实的细节描写，注重环境、动作、心理的真实感。避免过度戏剧化，用平实而精准的笔触描绘每一个场景和决定。',
  poetic: '【叙事风格：诗意】用优美、凝练的语言描绘场景和情感。注重意境营造，适当使用对仗、排比等修辞手法。文字要有韵律感和画面感。',
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

/** 每 N 轮生成一个摘要 */
export const SUMMARY_INTERVAL = 5

/** 最大上下文事件数 */
export const MAX_CONTEXT_EVENTS = 20

/** 滑动窗口基础事件数 */
export const SLIDING_WINDOW_RECENT_EVENTS_BASE = 20

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
 * 所有 wordCountTarget 回退值、computeNarrativeMaxTokens 下限、store 初始值均从此派生
 * 改动此处即可全局生效，无需在多个文件中手动同步
 */
export const DEFAULT_WORD_COUNT_TARGET = 400

/**
 * 根据大致字数生成 Prompt 字数约束文本
 */
export function buildWordCountInstruction(target: number): string {
  return [
    `【字数要求：大约${target}字】叙事内容应在此字数附近，不要过短或过长。`,
    '移动端可读性要求：三段合计控制在目标附近，每段不超过约160个汉字；不要为了凑字重复环境意象。',
    '完整性要求：第三段必须完成心理余韵或阶段性收束，正文末尾不得停在未说完的引出句。',
    '文字规范：使用常用简体中文，避免生僻字、异体字、日文新字体或繁体字混入。',
  ].join('\n')
}

/** 废弃项目 NARRATIVE_WORD_COUNT_DEFAULT_MAX */
export const NARRATIVE_WORD_COUNT_DEFAULT_MAX = 400

/**
 * 叙事 maxTokens 计算 —— 综合字数目标 + 固定开销（对齐废弃项目 life-sim-engine）
 * 使用 DEFAULT_WORD_COUNT_TARGET 作为字数下限，避免传入 0 或极小值时 token 预算过低
 */
export function computeNarrativeMaxTokens(wordCountTarget: number): number {
  const wordCountMax = Math.max(wordCountTarget, DEFAULT_WORD_COUNT_TARGET)
  return Math.ceil(wordCountMax * 5) + 2000
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

const NARRATIVE_TONE_HINT_MAX_LEN = 30

/** 将 calibration styleGuide.narrativeTone 映射为叙事 stable 段提示（≤30 字） */
export function resolveNarrativeToneHint(tone: string | undefined): string | undefined {
  const raw = tone?.trim()
  if (!raw) return undefined
  const mapped = NARRATIVE_TONE_ZH[raw] ?? raw
  return mapped.length > NARRATIVE_TONE_HINT_MAX_LEN
    ? mapped.slice(0, NARRATIVE_TONE_HINT_MAX_LEN)
    : mapped
}
