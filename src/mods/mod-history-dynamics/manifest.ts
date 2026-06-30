/**
 * @module manifest.ts
 * @description MOD 身份声明 —— 历史动态：事件池、因果模拟
 * @mod mod-history-dynamics
 */

import { defineMod } from '@/core'

export default defineMod({
  name: 'mod-history-dynamics',
  version: '1.0.0',
  description: '历史事件池管理、因果链模拟与大事年表追踪',
  dependencies: ['mod-engine', 'mod-world'],
  provides: ['history-dynamics', 'event-pool', 'causal-simulation'],
  consumes: [],
  subsystems: ['EventPoolSystem', 'CausalSimulationSystem'],
  stores: ['useHistoryDynamicsStore'],
  events: {
    emits: [
      'mod-history-dynamics:event-triggered',
      'mod-history-dynamics:causal-chain-resolved',
    ],
    listens: ['mod-engine:round-complete'],
  },
})
