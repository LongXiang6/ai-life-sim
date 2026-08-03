/**
 * @module manifest.ts
 * @description MOD 身份声明 —— 世界生成
 * @mod mod-world
 */

import { defineMod } from '@/core'

export default defineMod({
  name: 'mod-world',
  order: 200,
  version: '1.0.0',
  description: '世界生成与实体管理',
  dependencies: ['mod-engine'],
  provides: [
    'world',
    'world-init',
    'world-entity',
    'world-context-registry',
    'contextual-capability-profile',
    'spatial-graph',
    'context-transition',
    'simulation-scope-policy',
  ],
  consumes: [],
  subsystems: [
    'WorldContextRegistrySystem',
    'ContextualCapabilityProfileSystem',
    'SpatialGraphSystem',
    'ContextTransitionSystem',
    'SimulationScopePolicySystem',
    'WorldInitSystem',
    'WorldEntitySystem',
  ],
  /** 除 index.ts 外允许的跨 MOD 公共入口（重 API，与轻量 index 分离） */
  secondaryPublicEntries: ['world-init-api.ts', 'world-context-api.ts', 'world-runtime-api.ts'],
  stores: ['useWorldStore'],
  events: {
    emits: [
      'mod-world:initialized',
      'mod-world:entities-generated',
      'mod-world:context-left',
      'mod-world:context-arrived',
    ],
    listens: ['mod-engine:round-complete'],
  },
})
