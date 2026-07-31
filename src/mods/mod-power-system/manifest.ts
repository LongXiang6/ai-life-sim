/**
 * @module manifest.ts
 * @description MOD 身份声明 —— 力量体系：战力、怪物、气运
 * @mod mod-power-system
 */

import { defineMod } from '@/core'

export default defineMod({
  name: 'mod-power-system',
  order: 500,
  version: '1.0.0',
  description: '世界观插件：通用力量框架、修炼、怪物生态、机缘候选、信仰、神明干预与异常现象；只在上下文能力画像启用时运行',
  dependencies: ['mod-engine', 'mod-base-universe', 'mod-world'],
  provides: ['power-system', 'combat-power', 'cultivation', 'monster', 'fortune-encounter', 'faith', 'divine-intervention', 'anomaly-phenomena'],
  consumes: [],
  subsystems: [
    'CombatPowerSystem',
    'CultivationSystem',
    'MonsterSystem',
    'FortuneEncounterSystem',
    'FaithSystem',
    'DivineInterventionSystem',
    'AnomalyPhenomenaSystem',
  ],
  stores: ['usePowerSystemStore'],
  events: {
    emits: [
      'mod-power-system:stage-breakthrough',
      'mod-power-system:cultivation-bottleneck',
      'mod-power-system:cultivation-breakthrough',
      'mod-power-system:monster-evolution',
      'mod-power-system:luck-changed',
      'mod-power-system:fortune-encounter-triggered',
      'mod-power-system:faith-changed',
      'mod-power-system:divine-intervention-triggered',
      'mod-power-system:anomaly-zone-appeared',
    ],
    listens: ['mod-engine:round-complete'],
  },
})
