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

/** 时间线/实体类 Prompt：在简练基础上强调描述长度下限 */
export const TIMELINE_NARRATIVE_STYLE = [
  '叙事用现代白话，准确、有画面感',
  'description 须 50–80 汉字，勿为求短而省略细节',
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
 * 解析世界观事件风格 hint（idealist / 史前 / 默认 essence）
 */
export function resolveWorldviewStyleHint(opts: {
  cal?: WorldCalibration | null
  essenceTag: string
  worldDescription?: string
  worldType?: string
}): string {
  const { cal, essenceTag, worldDescription = '', worldType: _worldType } = opts

  const isIdealistWillpower =
    essenceTag === 'idealist_cultivation'
    || /无灵气|无魔力|无.*外部.*自然能量|意志即力量|心相|玄关|登天路/.test(worldDescription)

  if (isIdealistWillpower) {
    return IDEALIST_WILLPOWER_STYLE_HINT
  }

  if (cal?.styleGuide?.worldviewStyleHint?.trim()) {
    return cal.styleGuide.worldviewStyleHint.trim()
  }

  return getWorldviewStyleHint(cal, essenceTag)
}

/**
 * 时间线风格提示：保留 essence 默认风格，但要求 AI 先对照 worldDescription 决定是否采用
 */
export function buildTimelineStyleHint(
  _civilizationStage: string,
  worldDescription: string,
  essenceStyleHint: string,
  calibration?: WorldCalibration | null,
  worldType?: string,
  essenceTag?: string,
): string {
  const isIdealistWillpower =
    essenceTag === 'idealist_cultivation'
    || /无灵气|无魔力|无.*外部.*自然能量|意志即力量|心相|玄关|登天路/.test(worldDescription)

  if (isIdealistWillpower) {
    return IDEALIST_WILLPOWER_STYLE_HINT
  }
  const strategy = calibration?.formulas?.eventDistributionStrategy
  if (strategy === 'prehistoric') {
    return [
      '环境变迁、种群迁徙、工具创新、觅食域变动、古气候事件',
      '（须对照 worldDescription；勿写国家战争、修仙、智人文明史、宇宙级 drama）',
    ].join(' ')
  }

  if (/地猿|史前|新近纪|上新世|中新世|猿人|早期人类|古猿/.test(worldDescription)) {
    return [
      '环境变迁、种群迁徙、工具使用、气候波动、栖息地变化',
      '（勿写智人走出非洲、国家、修仙、宇宙战争；尺度限于种群与区域）',
    ].join(' ')
  }

  return [
    essenceStyleHint,
    '（须先对照 worldDescription 与 systemApplicability：若该风格与设定不符，改写实/环境/种群级事件，勿强行套用）',
  ].join(' ')
}
