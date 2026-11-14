/**
 * Purpose: Declare the difficulty MOD identity and lifecycle contract.
 * Owner: mod-difficulty
 * Responsibility: MOD manifest declaration only.
 */

/**
 * @module manifest.ts
 * @description MOD 身份声明 —— 五档叙事难度
 * @mod mod-difficulty
 */

import { defineMod } from '@/core'

export default defineMod({
  name: 'mod-difficulty',
  order: 120,
  version: '1.0.0',
  description: '五档人生叙事难度（休闲/轻松/正常/困难/噩梦）；难度只影响叙事命运倾向，不修改角色或世界模拟数值',
  dependencies: [],
  provides: ['difficulty'],
  consumes: [],
  subsystems: [],
  routes: [],
  stores: ['useDifficultyStore'],
  events: {
    emits: ['mod-difficulty:changed'],
    listens: [],
  },
})
