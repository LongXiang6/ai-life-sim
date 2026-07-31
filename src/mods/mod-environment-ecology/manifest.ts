/**
 * @module manifest.ts
 * @description MOD 身份声明 —— 环境生态：气候/地理/生态/自然资源/污染
 * @mod mod-environment-ecology
 */

import { defineMod } from '@/core'

export default defineMod({
  name: 'mod-environment-ecology',
  order: 430,
  version: '2.0.0',
  description: '按世界上下文运行的地理与自然资源系统，以及后续环境生态能力',
  dependencies: ['mod-engine', 'mod-world', 'mod-history-dynamics'],
  provides: [
    'environment-ecology',
    'climate',
    'geography',
    'ecology',
    'natural-resource',
    'pollution',
  ],
  consumes: ['spatial-graph', 'historical-event-ledger'],
  subsystems: [
    'ClimateSystem',
    'GeographySystem',
    'EcologySystem',
    'NaturalResourceSystem',
    'PollutionSystem',
  ],
  secondaryPublicEntries: ['environment-simulation-api.ts'],
  stores: ['useEnvironmentEcologyStore'],
  events: {
    emits: [
      'mod-environment-ecology:disaster-occurred',
      'mod-environment-ecology:resource-depleted',
      'mod-environment-ecology:species-extinct',
      'mod-environment-ecology:pollution-critical',
    ],
    listens: ['mod-engine:round-complete'],
  },
})
