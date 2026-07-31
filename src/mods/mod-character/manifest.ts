/**
 * @module manifest.ts
 * @description MOD 身份声明 —— 角色系统
 * @mod mod-character
 */

import { defineMod } from '@/core'

export default defineMod({
  name: 'mod-character',
  order: 600,
  version: '1.0.0',
  description: '角色属性、普通命格、跨局轮回天赋、寿命规则、生命周期、健康、善恶值与气运管理',
  dependencies: ['mod-engine', 'mod-power-system', 'mod-world'],
  provides: ['character', 'character-base', 'destiny-pattern', 'lifespan', 'lifecycle-system', 'health', 'morality', 'luck'],
  consumes: ['engine'],
  secondaryPublicEntries: ['destiny-pattern-access.ts', 'mythic-pattern-access.ts'],
  subsystems: [
    'CharacterBaseSystem',
    'DestinyPatternSystem',
    'LifespanSystem',
    'LifecycleSystem',
    'HealthSystem',
    'MoralitySystem',
    'LuckSystem',
  ],
  stores: ['useCharacterStore', 'useMythicLibraryStore'],
  prompts: ['race-origin', 'mythic-pattern'],
  events: {
    emits: ['mod-character:created', 'mod-character:died'],
    listens: ['mod-engine:round-complete'],
  },
})
