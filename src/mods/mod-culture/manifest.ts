/**
 * @module manifest.ts
 * @description MOD 身份声明 —— 文化系统
 * @mod mod-culture
 *
 * 拆分自 mod-social-civilization（9 个子系统）
 */

import { defineMod } from '@/core'

export default defineMod({
  name: 'mod-culture',
  order: 470,
  version: '1.0.0',
  description: '按上下文运行的文化公共价值、艺术生态、教育传播与作品实体',
  dependencies: ['mod-world', 'mod-social'],
  provides: [
    'culture', 'art', 'education', 'works',
  ],
  consumes: [],
  subsystems: [
    'CultureSystem',
    'ArtSystem',
    'EducationSystem',
    'WorksSystem',
  ],
  stores: ['useCultureStore'],
  events: {
    emits: [
      'mod-culture:festival-triggered',
      'mod-culture:masterpiece-created',
      'mod-culture:tech-advance',
    ],
    listens: ['mod-engine:round-complete'],
  },
})
