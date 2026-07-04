/**
 * @module world-coherence-hints.ts
 * @description 世界观系统适用性分析指引 —— 交由 AI 据 worldDescription 判断各模拟层是否成立
 * @mod mod-world
 */

import type { WorldCalibration } from '../types'

import { getWorldviewStyleHint } from './calibration-clamp'

/** 唯心 / 意志体系世界的事件风格（替代 cultivation 模板） */
const IDEALIST_WILLPOWER_STYLE_HINT = [
  '意志觉醒、玄关修炼、心相突破、宗门保守、登天路质变、维度探索、混沌海暗流',
  '（禁止套用灵气/灵石/仙帝/天劫/飞升/主神空间等外部能量修仙模板；须符合 worldDescription）',
].join(' ')



/** 通用叙事要求（现代白话，非文白夹杂） */
export const NARRATIVE_STYLE_DEFAULT = [
  '叙事用现代白话，简练准确、有画面感',
  '忌网游腔、忌与 worldDescription 不符的时代错置',
].join('；')

/** 供各 init Prompt 注入：AI 自行分析世界观后决定系统开关 */
export const WORLD_SYSTEM_APPLICABILITY_FRAMEWORK = [
  '【世界观系统适用性 —— 须由你分析 worldDescription 后自行判定】',
  '优先级：worldDescription > civilizationStage > essenceTag（标签不得覆盖设定）',
  '',
  '请先判断以下模拟层在本世界是否成立，再决定是否生成内容：',
  '- 政治实体层（国家/王朝/政权）',
  '- 势力组织层（宗门/公司/部落级组织/种群小群等）',
  '- 贵族或世袭阶层',
  '- 定居点文明链（巢穴/营地/城镇等，按实际组织度命名）',
  '- 贸易或长距离交换网络（商路/迁移路线/补给线等）',
  '- 组织性战争、成体系宗教、文字与成文法',
  '',
  '判定规则：',
  '1. 不适用的层：对应 JSON 字段返回空数组 []，勿硬套模板',
  '2. 部分适用：用符合该世界真实组织形态的名称与描述（例：地猿时代用「觅食群」「栖居点」，勿称「部落联盟」「商路」）',
  '3. 可在输出中包含 systemApplicability 对象（boolean），标明各层是否启用',
  '4. 时间线事件、实体、标签的尺度须与已启用层一致；勿把 trivial 事件写成未启用的高阶文明 drama',
  NARRATIVE_STYLE_DEFAULT,
].join('\n')

/**
 * 生成注入 Prompt 的世界观一致性指引（不含硬编码禁止清单，交由 AI 分析）
 */
export function buildWorldCoherenceHint(
  _civilizationStage: string,
  _worldDescription: string,
): string {
  return WORLD_SYSTEM_APPLICABILITY_FRAMEWORK
}

/**
 * 解析世界观事件风格 hint
 *
 * 优先级：
 *   1. AI 明确判定的 essenceTag（idealist_cultivation）→ 直接采用专属风格
 *   2. 校准配置中的用户风格设定（最高用户意图）
 *   3. essenceTag 默认风格
 *   描述关键词仅作"补充提示"拼接在默认风格之后，不强制替换
 */
export function resolveWorldviewStyleHint(opts: {
  cal?: WorldCalibration | null
  essenceTag: string
  worldDescription?: string
  worldType?: string
}): string {
  const { cal, essenceTag, worldDescription = '', worldType: _worldType } = opts

  // AI 明确判定的唯心修炼世界 → 专属风格（最高优先级，无需 regex）
  if (essenceTag === 'idealist_cultivation') {
    return IDEALIST_WILLPOWER_STYLE_HINT
  }

  // 用户校准配置优先
  if (cal?.styleGuide?.worldviewStyleHint?.trim()) {
    return cal.styleGuide.worldviewStyleHint.trim()
  }

  // 默认风格
  const baseHint = getWorldviewStyleHint(cal, essenceTag)

  // 描述含唯心关键词 → 追加补充提示（不替换 AI 默认风格）
  if (/无灵气|无魔力|无.*外部.*自然能量|意志即力量|心相|玄关|登天路/.test(worldDescription)) {
    return `${baseHint}\n若描述明确属唯心体系，可采用意志/心相/玄关叙事；若属混合或不确定，仍以 ${baseHint} 为准`
  }

  return baseHint
}
