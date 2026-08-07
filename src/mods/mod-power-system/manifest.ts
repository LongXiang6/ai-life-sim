/**
 * @module manifest.ts
 * @description MOD 身份声明 —— 力量体系：战力与修炼
 * @mod mod-power-system
 */

import { defineMod } from '@/core'

export default defineMod({
  name: 'mod-power-system',
  order: 500,
  version: '1.0.0',
  description: '世界观插件：通用力量框架与修炼；只在上下文能力画像启用时运行',
  dependencies: ['mod-engine', 'mod-world'],
  provides: ['power-system', 'combat-power', 'cultivation'],
  consumes: [],
  subsystems: [
    'CombatPowerSystem',
    'CultivationSystem',
  ],
  stores: ['usePowerSystemStore'],
  events: {
    emits: [
      'mod-power-system:stage-breakthrough',
      'mod-power-system:cultivation-bottleneck',
      'mod-power-system:cultivation-breakthrough',
    ],
    listens: ['mod-engine:round-complete'],
  },
})
