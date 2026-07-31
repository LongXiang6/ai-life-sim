/**
 * @module manifest.ts
 * @description MOD 身份声明 —— 基础宇宙设定：天象、纪元、世界地图、命运预言
 * @mod mod-base-universe
 */

import { defineMod } from '@/core'

export default defineMod({
  name: 'mod-base-universe',
  order: 440,
  version: '2.0.0',
  description: '按上下文运行的自然天象、当地纪元，以及可选的预言与神祇插件',
  dependencies: ['mod-engine', 'mod-world', 'mod-history-dynamics'],
  provides: ['base-universe', 'celestial', 'era', 'fate-prophecy', 'divine-creation'],
  consumes: [],
  subsystems: [
    'CelestialSystem',
    'EraSystem',
    'FateProphecySystem',
    'DivineCreationSystem',
  ],
  stores: ['useBaseUniverseStore'],
  events: {
    emits: [
      'mod-base-universe:celestial-phase-changed',
      'mod-base-universe:era-changed',
      'mod-base-universe:prophecy-fulfilled',
      'mod-base-universe:prophecy-broken',
      'mod-base-universe:deity-emerged',
      'mod-base-universe:deity-departed',
    ],
    listens: ['mod-engine:round-complete'],
  },
})
