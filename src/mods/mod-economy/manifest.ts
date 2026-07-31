/**
 * @module manifest.ts
 * @description MOD 身份声明 —— 经济系统
 * @mod mod-economy
 *
 * 拆分自 mod-social-civilization（5 个子系统）
 */
import { defineMod } from '@/core'

export default defineMod({
  name: 'mod-economy',
  order: 450,
  version: '1.0.0',
  description: '经济系统：经济/货币、工作/职业、物品/库存、定居点、人口',
  dependencies: ['mod-world', '~mod-politics'],
  provides: ['economy', 'work', 'item', 'settlement', 'population'],
  consumes: ['politics'],
  subsystems: [
    'EconomySystem',
    'WorkSystem',
    'ItemSystem',
    'SettlementSystem',
    'PopulationSystem',
  ],
  stores: ['useEconomyStore'],
  events: {
    emits: [
      'mod-economy:market-phase-change',
      'mod-economy:settlement-upgrade',
      'mod-economy:item-acquired',
      'mod-economy:career-promotion',
      'mod-economy:population-milestone',
    ],
    listens: ['mod-engine:round-complete'],
  },
})
