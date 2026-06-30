/**
 * @module manifest.ts
 * @description MOD 身份声明 —— 力量体系：战力、怪物、气运
 * @mod mod-power-system
 */

import { defineMod } from '@/core'

export default defineMod({
  name: 'mod-power-system',
  version: '1.0.0',
  description: '力量体系：战力24阶、修炼体系、怪物生态、气运修正、机缘奇遇、信仰、至尊物品、神明干预、异常现象、特殊材料。元控制：各子系统均含 enabled 开关，由 AI 根据世界观自动启用/禁用',
  dependencies: ['mod-engine', 'mod-base-universe', 'mod-world'],
  provides: ['power-system', 'combat-power', 'cultivation', 'monster', 'luck', 'fortune-encounter', 'faith', 'supreme-item', 'divine-intervention', 'anomaly-phenomena', 'special-material', 'skill'],
  consumes: [],
  subsystems: [
    'CombatPowerSystem',
    'CultivationSystem',
    'MonsterSystem',
    'LuckSystem',
    'FortuneEncounterSystem',
    'FaithSystem',
    'SupremeItemSystem',
    'DivineInterventionSystem',
    'AnomalyPhenomenaSystem',
    'SpecialMaterialSystem',
    'SkillSystem',
  ],
  stores: ['usePowerSystemStore'],
  prompts: [
    'adaptation-combat-power-prompt',
    'adaptation-cultivation-prompt',
    'adaptation-monster-prompt',
    'adaptation-luck-prompt',
    'adaptation-fortune-encounter-prompt',
    'adaptation-faith-prompt',
    'adaptation-supreme-item-prompt',
    'adaptation-divine-intervention-prompt',
    'adaptation-anomaly-phenomena-prompt',
    'adaptation-special-material-prompt',
  ],
  events: {
    emits: [
      'mod-power-system:stage-breakthrough',
      'mod-power-system:cultivation-bottleneck',
      'mod-power-system:cultivation-breakthrough',
      'mod-power-system:monster-evolution',
      'mod-power-system:luck-changed',
      'mod-power-system:fortune-encounter-triggered',
      'mod-power-system:faith-changed',
      'mod-power-system:supreme-item-obtained',
      'mod-power-system:supreme-item-awakened',
      'mod-power-system:divine-intervention-triggered',
      'mod-power-system:anomaly-zone-appeared',
      'mod-power-system:material-discovered',
    ],
    listens: ['mod-engine:round-complete'],
  },
})
