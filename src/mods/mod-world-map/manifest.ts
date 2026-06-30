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
  version: '1.0.0',
  description: '可视化世界地图：Canvas 渲染地形着色、势力标识、资源覆盖层，支持缩放/平移',
  dependencies: ['mod-base-universe', 'mod-ui'],
  provides: ['world-map-renderer'],
  consumes: ['base-universe', 'world-map-data'],
  subsystems: [],
  stores: ['useWorldMapStore'],
  prompts: [],
  events: {
    emits: [
      'mod-world-map:region-selected',
      'mod-world-map:view-changed',
    ],
    listens: ['mod-engine:round-complete'],
  },
})
