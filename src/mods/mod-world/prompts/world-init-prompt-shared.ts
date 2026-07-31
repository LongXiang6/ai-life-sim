/**
 * @module world-init-prompt-shared.ts
 * @description world-init 共享 system 前缀 —— 实体步 KV 复用
 * @mod mod-world
 */

import { stringifyPrompt } from '@/foundation'

import { NARRATIVE_STYLE_DEFAULT, WORLD_SYSTEM_APPLICABILITY_FRAMEWORK } from '../utils/world-coherence-hints'

/** 实体生成共用 system（无世界变量） */
export const worldEntityGeneratorSystemPrompt = stringifyPrompt({
  role: '世界实体生成 AI',
  narrativeStyle: NARRATIVE_STYLE_DEFAULT,
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
    nations: [{ name: '名称', capital: '核心地点', stability: '0-100', regionId: 'mapRegions 中的 regionId', description: '完整描述' }],
    factions: [{ name: '名称', factionType: 'military/religious/merchant/academic/political', power: '0-100', regionId: 'mapRegions 中的 regionId', description: '完整描述' }],
    nobleHouses: [{ name: '名称', rank: 'duke/marquis/earl/count/baron', influence: '0-100', regionId: 'mapRegions 中的 regionId', description: '完整描述' }],
    settlements: [{ name: '名称', tier: 'village/town/city/metropolis', developmentLevel: '0-100', regionId: 'mapRegions 中的 regionId（必填）', description: '完整描述' }],
    tradeRoutes: [{ name: '路线名称', fromSettlementId: '起点', toSettlementId: '终点', prosperity: '0-100' }],
  },
  generationPrinciples: [
    'systemApplicability 为 false 的层：对应数组必须返回 []',
    'worldDescription 优先于 essenceTag 与 civilizationStage',
    '实体 description 应完整保留身份、环境与因果信息，不得按字符数删短',
    'entityRanges 为各层数量上限；mapRegions 供 regionId 绑定',
    '数量参考：启用层内 nations 0-8，factions 0-8，nobleHouses 0-10，settlements 0-15，tradeRoutes 0-8',
  ],
})
