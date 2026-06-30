/**
 * @module manifest.ts
 * @description MOD 身份声明 —— UI 组件库
 * @mod mod-ui
 */

import { defineMod } from '@/core'

export default defineMod({
  name: 'mod-ui',
  version: '1.0.0',
  description: '通用 UI 组件库（Button / Modal / Card 等），支持桌面端和移动端适配',
  dependencies: [],
  provides: ['ui', 'components'],
  consumes: [],
  subsystems: [],
  routes: [],
  stores: ['useToastStore'],
  events: { emits: [], listens: [] },
  prompts: [],
})
