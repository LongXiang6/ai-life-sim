/**
 * @module manifest.ts
 * @description MOD 身份声明 —— 世界生成
 * @mod mod-world
 */

import { defineMod } from '@/core'

export default defineMod({
  name: 'mod-world',
  version: '1.0.0',
  description: '世界生成与时间线管理',
  dependencies: ['mod-engine'],
  provides: ['world', 'world-init', 'world-entity', 'world-timeline'],
  consumes: [],
  subsystems: ['WorldInitSystem', 'WorldEntitySystem', 'WorldTimelineSystem'],
  /** 除 index.ts 外允许的跨 MOD 公共入口（重 API，与轻量 index 分离） */
  secondaryPublicEntries: ['world-init-api.ts'],
  stores: ['useWorldStore'],
  events: {
    emits: ['mod-world:initialized', 'mod-world:entities-generated'],
    listens: ['mod-engine:round-complete'],
  },
})
