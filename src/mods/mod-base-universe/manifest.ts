/**
 * @module manifest.ts
 * @description MOD 身份声明 —— 基础宇宙设定：天象、纪元、世界地图、命运预言
 * @mod mod-base-universe
 */

import { defineMod } from '@/core'

export default defineMod({
  name: 'mod-base-universe',
  version: '1.0.0',
  description: '基础宇宙设定：天象、纪元、世界地图、命运预言、神创世界',
  dependencies: ['mod-engine'],
  provides: ['base-universe', 'celestial', 'era', 'world-map-data', 'fate-prophecy', 'divine-creation'],
  consumes: [],
  subsystems: [
    'CelestialSystem',
    'EraSystem',
    'WorldMapSystem',
    'FateProphecySystem',
    'DivineCreationSystem',
  ],
  stores: ['useBaseUniverseStore'],
  prompts: [
    'adaptation-divine-creation-prompt',
  ],
  events: {
    emits: [
      'mod-base-universe:celestial-phase-changed',
      'mod-base-universe:era-changed',
      'mod-base-universe:map-updated',
      'mod-base-universe:prophecy-fulfilled',
      'mod-base-universe:prophecy-broken',
      'mod-base-universe:deity-emerged',
      'mod-base-universe:deity-departed',
    ],
    listens: ['mod-engine:round-complete'],
  },
})
