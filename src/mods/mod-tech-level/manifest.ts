/**
 * @module manifest.ts
 * @description MOD 身份声明 —— 科技水平：产业、资源分布、文化技术
 * @mod mod-tech-level
 */

import { defineMod } from '@/core'

export default defineMod({
  name: 'mod-tech-level',
  order: 480,
  version: '2.0.0',
  description: '按上下文运行的知识领域、研究能力、技术应用与思想传播',
  dependencies: ['mod-engine', 'mod-world'],
  provides: ['tech-level', 'culture-tech'],
  consumes: [],
  subsystems: [
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
