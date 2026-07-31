/**
 * @module manifest.ts
 * @description MOD 身份声明 —— 四档难度系统
 * @mod mod-difficulty
 */

import { defineMod } from '@/core'

export default defineMod({
  name: 'mod-difficulty',
  order: 120,
  version: '1.0.0',
  description: '四档游戏难度配置（普通/困难/噩梦/地狱），提供灾害率、敌人强度、天花板压制、奇遇概率、消耗倍率等难度参数',
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
