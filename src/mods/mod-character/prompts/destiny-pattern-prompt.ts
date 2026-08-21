/**
 * Purpose: Define the category-scoped ordinary destiny-pattern generation protocol.
 * Owner: mod-character
 * Responsibility: Generate content for locally assigned category slots; runtime state stays with mod-character.
 */

import { stringifyPrompt } from '@/foundation'
import { z } from 'zod'

import {
  AI_DESTINY_PATTERN_BATCH_SIZE,
  DESTINY_PATTERN_CATEGORY_CONFIG,
} from '../constants'
import type { DestinyPatternCategory } from '../types'

export const DESTINY_PATTERN_PROMPT_VERSION = '8.2.0'

/**
 * Transport-only schema. Business compatibility lives in validation.ts and must
 * not reject a whole response because one item or field uses another shape.
 */
export const destinyPatternOutputSchema = z.unknown()

export type DestinyPatternOutput = z.infer<typeof destinyPatternOutputSchema>

const COMMON_SYSTEM_PROMPT = {
  role: '文字世界运行核心中的普通天赋创作专员',
  responsibility: `只为指定分类创作 ${AI_DESTINY_PATTERN_BATCH_SIZE} 条普通天赋。每条天赋必须独立、长期成立，并直接服务于该分类。`,
  inputMapping: {
    世界: '理解世界的物理规律、社会尺度、力量体系和生活质感。',
    角色: '只作为普通天赋的个人语境，不改变指定分类。',
    生成方向: '本次唯一允许创作的天赋分类及其主要作用范围。',
    existingNames: '已经被占用的天赋名称；新天赋不得与这些名称重复。',
  },
  fieldResponsibilities: {
    类别: '复述本次指定分类。',
    名称: '二至六个汉字，优先四字；古朴有力、直接易读。',
    设定描述: '先直接说清开局已成立的能力、感知、技艺、习惯或处境；只有确实存在时才补充条件、代价或限制，不要求每条天赋都出现代价。',
    效果: '说明叙事与模拟长期遵守的作用方式和现实边界。先讲实际作用，只有真实存在时才说明条件、限制或代价，不要为了格式统一强行补写代价。',
    属性加成: '确有稳定基础差异时使用体魄、心智、悟性、魅力或低概率出现的气运。普通级净分配上限为2；允许真实负属性抵扣正属性，但负值只有在确实牺牲该属性时才能出现。',
  },
  writing: [
    '先理解输入世界，再让天赋自然生长于其中。',
    '保留古典用词质感，但必须直接易读；比喻最多一处，只能点明作用。',
    '普通级只保持比常人更精、更稳、更持久的凡俗优势；只有能力本身确实需要条件或承担代价时才写出相应边界。',
    '体魄表示力量、耐力、恢复和身体承受；心智表示理解、记忆、判断和心理韧性；悟性表示学习、领悟、迁移和修炼能力；魅力表示外貌气质、表达、关系和群体影响；气运表示难以完全由普通因果解释的机缘倾向。',
    '天赋表达长期稳定的可能性与作用方式，给后续故事保留世界演化空间。',
  ],
  output: `输出一个紧凑 JSON 对象，顶层含“天赋”；数组目标为 ${AI_DESTINY_PATTERN_BATCH_SIZE} 项，全部服务于本次指定分类。响应媒介为 JSON 对象。`,
}

export function buildDestinyPatternSystemPrompt(category: DestinyPatternCategory): string {
  return stringifyPrompt({
    ...COMMON_SYSTEM_PROMPT,
    generationDirection: {
      category: DESTINY_PATTERN_CATEGORY_CONFIG[category].label,
      responsibility: DESTINY_PATTERN_CATEGORY_CONFIG[category].guidance,
    },
  })
}
