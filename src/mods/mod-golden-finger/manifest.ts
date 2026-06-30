/**
 * @module manifest
 * @description MOD 身份声明 —— 金手指系统：10种系统面板 + 5种非面板类型 + 3模式
 * @mod mod-golden-finger
 */

import { defineMod } from '@/core'

export default defineMod({
  name: 'mod-golden-finger',
  version: '1.0.0',
  description: '金手指系统：10种系统面板 + 5种非面板类型 + 关闭/随机/手动3模式',
  dependencies: ['mod-engine'],
  provides: ['golden-finger'],
  consumes: [],
  subsystems: ['GoldenFingerSystem'],
  stores: ['useGoldenFingerStore'],
  prompts: ['adaptation-golden-finger-prompt'],
  events: {
    emits: [
      'mod-golden-finger:assigned',
      'mod-golden-finger:leveled-up',
      'mod-golden-finger:feature-unlocked',
      'mod-golden-finger:panel-action-triggered',
    ],
    listens: ['mod-engine:round-complete'],
  },
})
