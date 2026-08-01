/**
 * @module narrative-config.ts
 * @description 叙事偏好配置常量 —— 叙事风格指令、字数范围、压缩参数
 * @mod mod-engine
 *
 * 来源：废弃项目 lib/config/ai/narrative-config.ts
 * 移植原则：用新项目 MOD 架构重新实现，常量归入 mod-engine/constants
 */

import {
  DEFAULT_WORD_COUNT_TARGET,
  resolveNarrativeWordCountTarget,
  type NarrativeWordCountTarget,
  type ReasoningEffort,
} from '@/foundation'
import {
  computeNarrativeTokenBudget,
  getNarrativeTokenCalibration,
} from '@/core/ai-service'

// ============================================================
// 叙事风格（4 种）—— Prompt 指令文本
// ============================================================

/** 叙事风格 ID */
export type NarrativeStyleId = 'default' | 'epic' | 'realistic' | 'poetic'

/** 叙事风格 Prompt 指令 */
export const NARRATIVE_STYLE_PROMPTS: Record<NarrativeStyleId, string> = {
  default: '【叙事风格：剧情默认】先根据世界压力、人生阶段和时间跨度选择合理剧情材料，再按当前时间尺度写角色亲历的具体事件或阶段节点。语言自然克制，少用作文式开头、主题升华、空泛总结或报告腔。',
  epic: '【叙事风格：史诗】宏大感优先来自时代压力如何改变角色命运。可以有历史感和象征，但必须服从当前时间尺度：日级选择足以折射格局的具体事件，长跨度选择前后承接的时代节点，再写角色或其延续主体的行动、代价与后果。',
  realistic: '【叙事风格：写实】以现实约束、社会规则、人物动机和具体阻力推动剧情。多写行动、对话、手续、资源限制和关系反应；少用报告腔、抒情作文和无因巧合。',
  poetic: '【叙事风格：诗意】意象服务剧情压力和人物选择。可以语言凝练、有画面感，但每段仍尽量推进事件、阻力或后果；少写成散文化独白或纯情绪描写。',
}

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

const NARRATIVE_DENSITY_INSTRUCTIONS: Record<NarrativeWordCountTarget, string> = {
  50: '写成一个短段、1至2个短句；只保留本轮视角不可缺少的因果节点，每句都推进时间、行动或格局。',
  100: '写成1至2个短段、2至3个短句；压缩背景，把篇幅用于本轮视角要求的起点、变化和结果。',
  150: '写成2个短段、3至4个短句；按本轮视角分配关键节点，每句增加新的行动、关系或阶段变化。',
  200: '写成2至3个短段、4至6个短句；按本轮视角分配必要节点，每句推进时间、行动、关系或格局，不重复铺陈。',
  250: '写成2至3个短段、5至7句；围绕同一因果主线展开本轮视角要求的节点，并形成明确新格局。',
  300: '写成3至4个短段、6至8句；完整覆盖本轮视角要求的起点、推进、转折与后果。',
  400: '充分展开同一因果主线，按本轮视角分配行动、关系、环境和阶段变化。',
  500: '分层呈现本轮视角要求的压力、选择、行动、关系回应和后续格局。',
  600: '围绕同一主线安排两到三个连续节拍或阶段节点，兼顾人物反应、环境变化与代价。',
  700: '展开多节拍或多阶段因果，让行动、关系、内在判断和外部后果相互推进。',
  800: '细致呈现完整因果链，允许次要人物或局部转折，但始终服务本轮视角与主线。',
  1000: '以章节级密度展开关键互动、阶段转折及其直接和延迟后果。',
  1200: '写成完整章节，充分呈现本轮视角要求的铺垫、升级、抉择、代价与余波。',
  1500: '写成长章节，以多个连续场景或阶段节点推进同一因果主线，并完成关键人物或延续主体的变化。',
  1800: '写成层次完整的长章节，容纳多场景或多阶段推进、关系变化、转折和明确收束。',
  2000: '写成充分展开的长章节，完整覆盖本轮因果链、人物群像反应、阶段变化、代价、余波与下一局面。',
}

/**
 * 根据大致字数生成 Prompt 字数约束文本
 */
export function buildWordCountInstruction(target: NarrativeWordCountTarget): string {
  const {
    target: normalizedTarget,
    preferredMin,
    preferredMax,
  } = resolveNarrativeWordCountRange(target)
  return [
    NARRATIVE_DENSITY_INSTRUCTIONS[normalizedTarget],
    `正文全部段落合计写成${preferredMin}-${preferredMax}字，中心约${normalizedTarget}字。`,
  ].join('\n')
}

export interface NarrativeMaxTokenOptions {
  reasoningEffort?: ReasoningEffort
  providerId?: string
  model?: string
}

/**
 * 叙事 maxTokens 计算：正文、协议信封、波动和思考余量分别估算并向上取整。
 * 同 Provider/模型/模式积累至少 8 个真实样本后使用 P95 校准。
 */
export function computeNarrativeMaxTokens(
  wordCountTarget: NarrativeWordCountTarget,
  options: NarrativeMaxTokenOptions = {},
): number {
  const normalizedTarget = resolveNarrativeWordCountTarget(wordCountTarget)
  const reasoningEffort = options.reasoningEffort ?? 'disabled'
  const calibration = options.providerId && options.model
    ? getNarrativeTokenCalibration({
      providerId: options.providerId,
      model: options.model,
      reasoningEffort,
    })
    : undefined
  return computeNarrativeTokenBudget({
    targetChineseCharacters: normalizedTarget,
    reasoningEffort,
    calibration,
  })
}

export { DEFAULT_WORD_COUNT_TARGET }

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
