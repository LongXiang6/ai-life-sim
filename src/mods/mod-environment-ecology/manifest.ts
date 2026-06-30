/**
 * @module manifest.ts
 * @description MOD 身份声明 —— 环境生态：气候/地理/生态/自然资源/污染
 * @mod mod-environment-ecology
 */

import { defineMod } from '@/core'

export default defineMod({
  name: 'mod-environment-ecology',
  version: '1.0.0',
  description: '环境生态：气候系统、地理系统、生态系统、自然资源与污染管理',
  dependencies: ['mod-engine', 'mod-world'],
  provides: [
    'environment-ecology',
    'climate',
    'geography',
    'ecology',
    'natural-resource',
    'pollution',
  ],
  consumes: [],
  subsystems: [
    'ClimateSystem',
    'GeographySystem',
    'EcologySystem',
    'NaturalResourceSystem',
    'PollutionSystem',
  ],
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
