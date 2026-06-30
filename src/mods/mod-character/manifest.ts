/**
 * @module manifest.ts
 * @description MOD 身份声明 —— 角色系统
 * @mod mod-character
 */

import { defineMod } from '@/core'

export default defineMod({
  name: 'mod-character',
  version: '1.0.0',
  description: '角色属性、命格、健康、寿命、生命阶段、年龄衰减、善恶值、气运管理',
  dependencies: ['mod-engine', 'mod-power-system', 'mod-world'],
  provides: ['character', 'character-base', 'destiny-pattern', 'health', 'lifespan', 'life-stage', 'attribute-decay', 'morality', 'post-death-epilogue'],
  consumes: ['engine'],
  secondaryPublicEntries: ['destiny-pattern-access.ts'],
  subsystems: [
    'CharacterBaseSystem',
    'DestinyPatternSystem',
    'HealthSystem',
    'LifespanSystem',
    'LifeStageSystem',
    'AttributeDecaySystem',
    'MoralitySystem',
    'PostDeathEpilogueSystem',
  ],
  stores: ['useCharacterStore'],
  prompts: ['race-origin'],
  events: {
    emits: ['mod-character:created', 'mod-character:died', 'mod-character:stage-changed', 'mod-character:breakthrough'],
    listens: ['mod-engine:round-complete'],
  },
})
