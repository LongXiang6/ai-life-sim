/**
 * @module manifest.ts
 * @description MOD 身份声明 —— 科技水平：产业、资源分布、文化技术
 * @mod mod-tech-level
 */

import { defineMod } from '@/core'

export default defineMod({
  name: 'mod-tech-level',
  version: '1.0.0',
  description: '科技水平：产业判定与资源分布、文化技术与思潮演化',
  dependencies: ['mod-engine', 'mod-world'],
  provides: ['tech-level', 'industry', 'culture-tech'],
  consumes: [],
  subsystems: [
    'IndustrySystem',
    'CultureTechSystem',
  ],
  stores: ['useTechLevelStore'],
  prompts: [],
  events: {
    emits: [
      'mod-tech-level:industry-shift',
      'mod-tech-level:tech-breakthrough',
      'mod-tech-level:trend-emerged',
      'mod-tech-level:trend-faded',
    ],
    listens: ['mod-engine:round-complete'],
  },
})
