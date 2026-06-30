/**
 * @module utils
 * @description 工具函数 —— 金手指模板查询
 * @mod mod-golden-finger
 */

import type { GoldenFingerTemplate, GoldenFingerKind } from './types'

import { GOLDEN_FINGER_TEMPLATES } from './constants'

/**
 * 按 ID 查找金手指模板
 * @param id - 模板 ID
 * @returns 匹配的模板，未找到返回 undefined
 */
export function getTemplateById(id: string): GoldenFingerTemplate | undefined {
  return GOLDEN_FINGER_TEMPLATES.find((t) => t.id === id)
}

/**
 * 按种类筛选金手指模板
 * @param kind - 金手指种类
 * @returns 匹配的模板列表
 */
export function getTemplatesByKind(kind: GoldenFingerKind): GoldenFingerTemplate[] {
  return GOLDEN_FINGER_TEMPLATES.filter((t) => t.kind === kind)
}
