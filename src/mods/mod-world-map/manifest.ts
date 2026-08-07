/**
 * @module manifest.ts
 * @description MOD 身份声明 —— 可视化世界地图
 * @mod mod-world-map
 *
 * 创意 #11：可视化世界地图
 * 基于 HTML5 Canvas 渲染区域地图，无额外依赖
 */

import { defineMod } from '@/core'

export default defineMod({
  name: 'mod-world-map',
  order: 800,
  version: '2.0.0',
  description: '将世界区域关系与区域概况投影为地图、星图或场景导航视图',
  dependencies: ['mod-engine', 'mod-world', 'mod-ui'],
  provides: ['world-map-renderer', 'map-projection'],
  consumes: ['spatial-graph'],
  subsystems: [],
  stores: ['useWorldMapStore'],
  prompts: [],
  events: {
    emits: [
      'mod-world-map:node-selected',
      'mod-world-map:view-changed',
    ],
    listens: ['mod-engine:round-complete'],
  },
})
