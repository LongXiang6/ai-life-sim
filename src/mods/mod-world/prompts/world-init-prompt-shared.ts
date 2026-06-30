/**
 * @module world-init-prompt-shared.ts
 * @description world-init 共享 system 前缀 —— 时间线/上古史/实体步 KV 复用
 * @mod mod-world
 */

import { stringifyPrompt } from '@/foundation'

import { TIMELINE_NARRATIVE_STYLE, WORLD_SYSTEM_APPLICABILITY_FRAMEWORK } from '../utils/world-coherence-hints'

/** 九级影响（timeline / past-history 共用，字节级前缀一致） */
export const SHARED_EVENT_IMPACT_LEVELS = [
  { level: 'trivial', label: '琐事级', scale: '个体或极小范围日常' },
  { level: 'minor', label: '小事级', scale: '小范围变动' },
  { level: 'local', label: '局部级', scale: '一片区域/觅食域内' },
  { level: 'regional', label: '区域级', scale: '跨谷地/湖区等较大范围' },
  { level: 'national', label: '国家级', scale: '仅当政治实体层启用时' },
  { level: 'continental', label: '大陆级', scale: '板块级环境或文明变动' },
  { level: 'world', label: '世界级', scale: '全球性或文明转折' },
  { level: 'cosmic', label: '宇宙级', scale: '仅高魔/科幻世界观且设定支持时' },
  { level: 'infinite', label: '无限级', scale: '仅设定明确支持的终局尺度' },
] as const

export const SHARED_EVENT_ELEMENT_SCHEMA = {
  year: '年份数字（未来：正整数须与输入一致；上古史：负整数相对纪元偏移）',
  title: '事件标题（8-16字）',
  description: '事件描述（50-80字，现代白话）',
  impact: 'trivial | minor | local | regional | national | continental | world | cosmic | infinite',
  type: '事件类型',
  chainEffects: ['后续影响1', '后续影响2'],
  involvedFactions: ['参与方；不适用则 []'],
}

/** 未来时间线 + 上古史共用 system（无世界变量；taskMode 在 user 指定） */
export const worldEventNarratorSystemPrompt = stringifyPrompt({
  expertise: ['史前', '古代', '修仙', '玄幻', '科幻', '奇幻', '历史', '现代'],
  narrativeStyle: TIMELINE_NARRATIVE_STYLE,
  impactLevels: SHARED_EVENT_IMPACT_LEVELS,
  outputFormat: {
    type: '纯JSON数组',
    elementSchema: SHARED_EVENT_ELEMENT_SCHEMA,
  },
  constraints: [
    '输出必须是纯JSON数组，无 markdown 代码块',
    '紧凑输出：每个元素一行',
    '先阅读 user.coherenceHint 分析系统适用层',
    'worldDescription 为最高优先级',
    '具体任务模式见 user.taskMode（future=未来时间线 / past=上古史）',
  ],
})

/** 实体生成共用 system（无世界变量） */
export const worldEntityGeneratorSystemPrompt = stringifyPrompt({
  role: '世界实体生成 AI',
  narrativeStyle: TIMELINE_NARRATIVE_STYLE,
  systemApplicabilityFramework: WORLD_SYSTEM_APPLICABILITY_FRAMEWORK,
  task: '分析 user 中的世界观上下文后生成具名实体；不适用的系统层返回空数组',
  outputFormat: 'JSON，不要 markdown 代码块包裹',
  outputSchema: {
    systemApplicability: {
      nations: 'boolean',
      factions: 'boolean',
      nobleHouses: 'boolean',
      settlements: 'boolean',
      tradeRoutes: 'boolean',
    },
    nations: [{ name: '名称', capital: '核心地点', stability: '0-100', population: '数量', regionId: 'mapRegions 中的 regionId', description: '描述(30-80字)' }],
    factions: [{ name: '名称', factionType: 'military/religious/merchant/academic/political', power: '0-100', regionId: 'mapRegions 中的 regionId', description: '描述(30-80字)' }],
    nobleHouses: [{ name: '名称', rank: 'duke/marquis/earl/count/baron', influence: '0-100', regionId: 'mapRegions 中的 regionId', description: '描述(30-80字)' }],
    settlements: [{ name: '名称', tier: 'village/town/city/metropolis', population: '数量', developmentLevel: '0-100', regionId: 'mapRegions 中的 regionId（必填）', description: '描述(30-80字)' }],
    tradeRoutes: [{ name: '路线名称', fromSettlementId: '起点', toSettlementId: '终点', prosperity: '0-100' }],
  },
  generationPrinciples: [
    'systemApplicability 为 false 的层：对应数组必须返回 []',
    'worldDescription 优先于 essenceTag 与 civilizationStage',
    'entityRanges 为各层数量上限；mapRegions 供 regionId 绑定',
    '数量参考：启用层内 nations 0-8，factions 0-8，nobleHouses 0-10，settlements 0-15，tradeRoutes 0-8',
  ],
})
