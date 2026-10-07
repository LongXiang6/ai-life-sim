/**
 * Purpose: Declare the character MOD identity, dependencies, and public entries.
 * Owner: mod-character
 * Responsibility: Manifest metadata only; character behavior remains in the MOD implementation.
 *
 * @module manifest.ts
 * @description MOD 身份声明 —— 角色系统
 * @mod mod-character
 */

import { defineMod } from '@/core'

export default defineMod({
  name: 'mod-character',
  order: 600,
  version: '1.0.0',
  description: '角色基础属性、生命状态、隐藏倾向、普通命格与跨局轮回天赋管理',
  dependencies: ['mod-engine', 'mod-power-system', 'mod-world'],
  provides: ['character', 'character-base', 'destiny-pattern'],
  consumes: ['engine'],
  secondaryPublicEntries: [
    'character-base-access.ts',
    'destiny-pattern-access.ts',
    'reincarnation-talent-access.ts',
  ],
  subsystems: [
    'CharacterBaseSystem',
    'DestinyPatternSystem',
  ],
  stores: ['useCharacterStore', 'useReincarnationLibraryStore'],
  prompts: ['race-origin', 'reincarnation-promotion'],
  events: {
    emits: ['mod-character:created', 'mod-character:died'],
    listens: ['mod-engine:round-complete'],
  },
})
